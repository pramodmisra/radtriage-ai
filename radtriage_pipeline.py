"""
RadTriage AI — Multimodal Radiology Triage & Report Drafting Pipeline
=====================================================================
Uses MedGemma (google/medgemma-4b-it) for two-pass radiology analysis:
  Pass 1: Structured findings extraction with confidence scores
  Pass 2: Narrative report generation grounded in structured findings

Competition: MedGemma Impact Challenge (Kaggle)
Track: Main + Agentic Workflow Prize
"""

import json
import time
import logging
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Optional
from pathlib import Path

import torch
from PIL import Image
from transformers import AutoProcessor, AutoModelForImageTextToText

# ── Configuration ──────────────────────────────────────────────

MODEL_ID = "google/medgemma-4b-it"  # or "google/medgemma-27b-it" for higher quality
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DTYPE = torch.bfloat16 if torch.cuda.is_available() else torch.float32

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("radtriage")


# ── Data Models ────────────────────────────────────────────────

class TriageLevel(str, Enum):
    CRITICAL = "CRITICAL"
    URGENT = "URGENT"
    ROUTINE = "ROUTINE"


class Severity(str, Enum):
    NORMAL = "normal"
    MILD = "mild"
    MODERATE = "moderate"
    SEVERE = "severe"


@dataclass
class Finding:
    id: int
    description: str
    location: str
    severity: str
    confidence: float


@dataclass
class StructuredFindings:
    """Output of Pass 1: structured extraction from image."""
    modality_detected: str
    anatomical_region: str
    image_quality: str  # "adequate", "suboptimal", "non-diagnostic"
    quality_issues: list[str]
    comparison_available: bool
    findings: list[Finding]
    overall_impression_category: str  # "normal", "abnormal", "critical"
    missing_context: list[str]


@dataclass
class TriageResult:
    level: TriageLevel
    rationale: str
    recommended_actions: list[str]
    time_sensitivity: str  # e.g., "Immediate", "Within 2 hours", "Within 24 hours"


@dataclass
class PipelineOutput:
    """Complete output of the RadTriage pipeline."""
    case_id: str
    structured_findings: StructuredFindings
    narrative_report: str
    triage: TriageResult
    confidence_warnings: list[str]
    processing_time_seconds: float


# ── Modality-Aware Prompt Templates ────────────────────────────

MODALITY_PROMPTS = {
    "chest_xray": {
        "name": "Chest X-ray",
        "additional_checks": (
            "Specifically evaluate for: pneumothorax, pleural effusion, consolidation, "
            "cardiomegaly, mediastinal widening, line/tube placement, rib fractures, "
            "and pulmonary edema. Note the projection (PA/AP/lateral)."
        ),
    },
    "ct_head": {
        "name": "CT Head",
        "additional_checks": (
            "Specifically evaluate for: intracranial hemorrhage (epidural, subdural, "
            "subarachnoid, intraparenchymal, intraventricular), mass effect, midline shift, "
            "hydrocephalus, acute infarction signs, calvarial fractures, and "
            "gray-white matter differentiation."
        ),
    },
    "ct_chest": {
        "name": "CT Chest",
        "additional_checks": (
            "Specifically evaluate for: pulmonary nodules, ground glass opacities, "
            "consolidation, pulmonary embolism, lymphadenopathy, pleural disease, "
            "aortic pathology, and incidental findings. Note contrast phase if applicable."
        ),
    },
    "mri_brain": {
        "name": "MRI Brain",
        "additional_checks": (
            "Specifically evaluate for: acute infarct (DWI restriction), enhancing lesions, "
            "mass effect, hemorrhage (susceptibility), FLAIR hyperintensity, "
            "ventricular size, and signal abnormalities. Note available sequences."
        ),
    },
    "histopathology": {
        "name": "Histopathology",
        "additional_checks": (
            "Specifically evaluate for: architectural pattern, cellular atypia, "
            "mitotic activity, margins, necrosis, vascular invasion, and grade. "
            "Identify the tissue type and staining method."
        ),
    },
    "generic": {
        "name": "Medical Image",
        "additional_checks": (
            "Identify the imaging modality and anatomical region. Provide a systematic "
            "analysis of all visible findings."
        ),
    },
}


# ── Model Loading ──────────────────────────────────────────────

class MedGemmaModel:
    """Wrapper for MedGemma model loading and inference."""

    def __init__(self, model_id: str = MODEL_ID):
        self.model_id = model_id
        self.model = None
        self.processor = None

    def load(self):
        """Load model and processor. Call once at startup."""
        logger.info(f"Loading MedGemma model: {self.model_id}")
        self.processor = AutoProcessor.from_pretrained(self.model_id)
        self.model = AutoModelForImageTextToText.from_pretrained(
            self.model_id,
            torch_dtype=DTYPE,
            device_map=DEVICE,
        )
        self.model.eval()
        logger.info(f"Model loaded on {DEVICE} with dtype {DTYPE}")

    def generate(
        self,
        prompt: str,
        image: Optional[Image.Image] = None,
        max_new_tokens: int = 2048,
        temperature: float = 0.2,
    ) -> str:
        """Run inference with MedGemma."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call .load() first.")

        # Build messages in chat format
        content = []
        if image is not None:
            content.append({"type": "image", "image": image})
        content.append({"type": "text", "text": prompt})

        messages = [{"role": "user", "content": content}]

        inputs = self.processor.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
        ).to(self.model.device, dtype=DTYPE)

        with torch.inference_mode():
            output_ids = self.model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                temperature=temperature,
                do_sample=temperature > 0,
            )

        # Decode only new tokens
        input_len = inputs["input_ids"].shape[-1]
        generated = self.processor.decode(
            output_ids[0][input_len:], skip_special_tokens=True
        )
        return generated.strip()


# ── Pipeline ───────────────────────────────────────────────────

class RadTriagePipeline:
    """
    Two-pass radiology triage and report drafting pipeline.

    Pass 1: Image → Structured Findings (JSON)
    Pass 2: Structured Findings → Narrative Report (text)
    Triage: Findings → CRITICAL / URGENT / ROUTINE
    """

    def __init__(self, model: MedGemmaModel):
        self.model = model

    def detect_modality(self, image: Image.Image, hint: Optional[str] = None) -> str:
        """Detect or confirm the imaging modality."""
        if hint and hint.lower() in MODALITY_PROMPTS:
            return hint.lower()

        # Ask MedGemma to identify the modality
        prompt = (
            "What type of medical imaging modality is shown in this image? "
            "Respond with ONLY one of: chest_xray, ct_head, ct_chest, mri_brain, "
            "histopathology, or generic. No explanation."
        )
        result = self.model.generate(prompt, image=image, max_new_tokens=20, temperature=0.0)
        modality = result.strip().lower().replace(" ", "_")

        if modality not in MODALITY_PROMPTS:
            modality = "generic"

        logger.info(f"Modality detected: {modality}")
        return modality

    def pass1_structured_findings(
        self,
        image: Image.Image,
        modality: str,
        clinical_indication: str = "",
        prior_studies: str = "None",
    ) -> StructuredFindings:
        """
        PASS 1: Extract structured findings from the medical image.
        Returns machine-readable JSON with confidence scores.
        """
        mod_info = MODALITY_PROMPTS.get(modality, MODALITY_PROMPTS["generic"])

        prompt = f"""You are an expert radiologist assistant analyzing a {mod_info['name']} image.

Clinical indication: {clinical_indication or 'Not provided'}
Prior studies: {prior_studies}

{mod_info['additional_checks']}

Analyze the image systematically and respond ONLY with a valid JSON object (no markdown, no explanation) following this exact schema:
{{
  "modality_detected": "<specific modality and technique>",
  "anatomical_region": "<body region>",
  "image_quality": "<adequate|suboptimal|non-diagnostic>",
  "quality_issues": ["<list of quality issues, empty if adequate>"],
  "comparison_available": <true if prior studies mentioned, false otherwise>,
  "findings": [
    {{
      "id": <integer>,
      "description": "<detailed finding description>",
      "location": "<anatomical location>",
      "severity": "<normal|mild|moderate|severe>",
      "confidence": <float 0.0 to 1.0>
    }}
  ],
  "overall_impression_category": "<normal|abnormal|critical>",
  "missing_context": ["<list of information that would improve interpretation>"]
}}

IMPORTANT RULES:
- Assign confidence scores honestly. If you're uncertain, use lower scores.
- If image quality prevents reliable assessment, set image_quality to "non-diagnostic" and explain in quality_issues.
- Include at least one finding, even if normal (e.g., "No acute abnormality identified").
- List ALL missing context that would improve diagnostic confidence.
- Be systematic: evaluate all visible anatomical structures."""

        logger.info("Pass 1: Extracting structured findings...")
        raw_output = self.model.generate(prompt, image=image, max_new_tokens=2048, temperature=0.1)

        # Parse JSON response
        try:
            # Clean potential markdown code blocks
            cleaned = raw_output.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1]
            if cleaned.endswith("```"):
                cleaned = cleaned.rsplit("```", 1)[0]
            cleaned = cleaned.strip()

            data = json.loads(cleaned)

            findings = [
                Finding(
                    id=f.get("id", i + 1),
                    description=f["description"],
                    location=f["location"],
                    severity=f.get("severity", "normal"),
                    confidence=float(f.get("confidence", 0.5)),
                )
                for i, f in enumerate(data.get("findings", []))
            ]

            return StructuredFindings(
                modality_detected=data.get("modality_detected", mod_info["name"]),
                anatomical_region=data.get("anatomical_region", "Unknown"),
                image_quality=data.get("image_quality", "adequate"),
                quality_issues=data.get("quality_issues", []),
                comparison_available=data.get("comparison_available", False),
                findings=findings,
                overall_impression_category=data.get("overall_impression_category", "abnormal"),
                missing_context=data.get("missing_context", []),
            )

        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Failed to parse Pass 1 output as JSON: {e}")
            logger.warning(f"Raw output: {raw_output[:500]}")
            # Fallback: create a single finding from raw text
            return StructuredFindings(
                modality_detected=mod_info["name"],
                anatomical_region="Unknown",
                image_quality="suboptimal",
                quality_issues=["Model output could not be parsed as structured JSON"],
                comparison_available=False,
                findings=[
                    Finding(
                        id=1,
                        description=raw_output[:500],
                        location="See full description",
                        severity="moderate",
                        confidence=0.4,
                    )
                ],
                overall_impression_category="abnormal",
                missing_context=["Structured extraction failed — manual review required"],
            )

    def pass2_narrative_report(
        self,
        structured_findings: StructuredFindings,
        clinical_indication: str = "",
    ) -> str:
        """
        PASS 2: Generate a narrative radiology report from structured findings.
        This grounded approach reduces hallucination compared to single-pass.
        """
        findings_json = json.dumps(
            asdict(structured_findings), indent=2, default=str
        )

        prompt = f"""You are a radiologist drafting a formal report. Convert the following structured findings into a professional radiology report following ACR reporting guidelines.

STRUCTURED FINDINGS:
{findings_json}

CLINICAL INDICATION: {clinical_indication or 'Not provided'}

Generate a report with these exact sections:
EXAMINATION: [Modality and technique]
CLINICAL INDICATION: [From context provided]
COMPARISON: [Prior studies or "None available"]
FINDINGS: [Detailed narrative description of each finding. Use standard radiology terminology. Group by anatomical region.]
IMPRESSION: [Numbered list of key findings, most critical first. Include severity.]

IMPORTANT RULES:
- ONLY describe findings present in the structured data above. Do NOT invent additional findings.
- If any finding has confidence < 0.6, use hedging language: "possible", "cannot exclude", "further evaluation recommended".
- If image_quality is not "adequate", include a TECHNIQUE LIMITATION section.
- If confidence < 0.4 for a finding, explicitly state the model cannot reliably characterize it.
- End with RECOMMENDATION section if any finding requires follow-up."""

        logger.info("Pass 2: Generating narrative report...")
        report = self.model.generate(prompt, max_new_tokens=2048, temperature=0.2)
        return report

    def classify_triage(self, findings: StructuredFindings) -> TriageResult:
        """
        Classify urgency based on structured findings.
        Uses rule-based logic augmented with finding severity and confidence.
        """
        # Determine triage level based on findings
        has_severe = any(f.severity == "severe" for f in findings.findings)
        has_moderate = any(f.severity == "moderate" for f in findings.findings)
        is_critical_category = findings.overall_impression_category == "critical"

        # Critical findings keywords
        critical_keywords = [
            "hemorrhage", "pneumothorax", "tension", "stroke", "embolism",
            "dissection", "perforation", "herniation", "midline shift",
            "mass effect", "acute infarct", "tamponade",
        ]
        has_critical_finding = any(
            any(kw in f.description.lower() for kw in critical_keywords)
            for f in findings.findings
        )

        if is_critical_category or has_critical_finding or has_severe:
            level = TriageLevel.CRITICAL
            time_sensitivity = "Immediate — notify referring physician now"
            actions = [
                "Page attending radiologist for immediate read",
                "Direct communication with referring clinician",
                "Consider additional urgent imaging (CTA, MRI, etc.)",
            ]
        elif has_moderate:
            level = TriageLevel.URGENT
            time_sensitivity = "Within 2-4 hours"
            actions = [
                "Prioritize for radiologist review",
                "Flag in worklist for early attention",
                "Correlate with clinical status",
            ]
        else:
            level = TriageLevel.ROUTINE
            time_sensitivity = "Within 24 hours (standard turnaround)"
            actions = [
                "Standard radiologist review queue",
                "No urgent action required",
            ]

        # Build rationale from top findings
        top_findings = sorted(
            findings.findings, key=lambda f: f.confidence, reverse=True
        )[:3]
        rationale_parts = [
            f"{f.description} (confidence: {f.confidence:.0%})"
            for f in top_findings
            if f.severity != "normal"
        ]
        if not rationale_parts:
            rationale = "No significant abnormalities identified."
        else:
            rationale = "Key findings driving triage: " + "; ".join(rationale_parts)

        # Add calibration warning
        low_conf = [f for f in findings.findings if f.confidence < 0.6 and f.severity != "normal"]
        if low_conf:
            rationale += (
                f" NOTE: {len(low_conf)} finding(s) have low confidence and "
                "require radiologist verification."
            )

        return TriageResult(
            level=level,
            rationale=rationale,
            recommended_actions=actions,
            time_sensitivity=time_sensitivity,
        )

    def generate_confidence_warnings(self, findings: StructuredFindings) -> list[str]:
        """Generate calibrated warnings when the model is uncertain."""
        warnings = []

        # Image quality warnings
        if findings.image_quality == "non-diagnostic":
            warnings.append(
                "IMAGE QUALITY: Non-diagnostic. Findings may be unreliable. "
                "Recommend repeat imaging with improved technique."
            )
        elif findings.image_quality == "suboptimal":
            issues = ", ".join(findings.quality_issues) if findings.quality_issues else "unspecified"
            warnings.append(
                f"IMAGE QUALITY: Suboptimal ({issues}). "
                "Some findings may have reduced reliability."
            )

        # Low confidence findings
        for f in findings.findings:
            if f.confidence < 0.4 and f.severity != "normal":
                warnings.append(
                    f"LOW CONFIDENCE ({f.confidence:.0%}): '{f.description}' — "
                    "Cannot reliably characterize. Additional imaging recommended."
                )
            elif f.confidence < 0.6 and f.severity != "normal":
                warnings.append(
                    f"MODERATE CONFIDENCE ({f.confidence:.0%}): '{f.description}' — "
                    "Interpretation should be considered preliminary."
                )

        # Missing comparison
        if not findings.comparison_available:
            warnings.append(
                "NO PRIOR COMPARISON: Unable to assess interval change. "
                "Request prior imaging if available."
            )

        return warnings

    def run(
        self,
        image: Image.Image,
        case_id: str = "UNKNOWN",
        modality_hint: Optional[str] = None,
        clinical_indication: str = "",
        prior_studies: str = "None",
    ) -> PipelineOutput:
        """
        Execute the complete two-pass pipeline.

        Args:
            image: PIL Image of the medical study
            case_id: Study/accession identifier
            modality_hint: Optional modality override (e.g., "chest_xray")
            clinical_indication: Clinical reason for exam
            prior_studies: Description of available prior studies

        Returns:
            PipelineOutput with all results
        """
        start = time.time()
        logger.info(f"=== RadTriage Pipeline START: {case_id} ===")

        # Step 1: Detect modality
        modality = self.detect_modality(image, hint=modality_hint)

        # Step 2: Pass 1 — Structured findings
        structured = self.pass1_structured_findings(
            image, modality, clinical_indication, prior_studies
        )
        logger.info(
            f"Pass 1 complete: {len(structured.findings)} findings, "
            f"category={structured.overall_impression_category}"
        )

        # Step 3: Pass 2 — Narrative report
        report = self.pass2_narrative_report(structured, clinical_indication)
        logger.info(f"Pass 2 complete: {len(report)} chars")

        # Step 4: Triage classification
        triage = self.classify_triage(structured)
        logger.info(f"Triage: {triage.level.value} — {triage.time_sensitivity}")

        # Step 5: Confidence warnings
        warnings = self.generate_confidence_warnings(structured)

        elapsed = time.time() - start
        logger.info(f"=== Pipeline DONE in {elapsed:.1f}s ===")

        return PipelineOutput(
            case_id=case_id,
            structured_findings=structured,
            narrative_report=report,
            triage=triage,
            confidence_warnings=warnings,
            processing_time_seconds=round(elapsed, 2),
        )


# ── CLI / Demo ─────────────────────────────────────────────────

def demo():
    """Run a demo with a sample image."""
    import argparse

    parser = argparse.ArgumentParser(description="RadTriage AI Pipeline")
    parser.add_argument("image_path", help="Path to medical image")
    parser.add_argument("--modality", default=None, help="Modality hint")
    parser.add_argument("--indication", default="", help="Clinical indication")
    parser.add_argument("--priors", default="None", help="Prior studies")
    parser.add_argument("--output", default=None, help="Output JSON path")
    args = parser.parse_args()

    # Load model
    model = MedGemmaModel()
    model.load()

    # Load image
    image = Image.open(args.image_path).convert("RGB")

    # Run pipeline
    pipeline = RadTriagePipeline(model)
    result = pipeline.run(
        image=image,
        case_id=Path(args.image_path).stem,
        modality_hint=args.modality,
        clinical_indication=args.indication,
        prior_studies=args.priors,
    )

    # Output
    print("\n" + "=" * 60)
    print(f"TRIAGE: {result.triage.level.value}")
    print(f"TIME SENSITIVITY: {result.triage.time_sensitivity}")
    print("=" * 60)
    print(f"\nFINDINGS ({len(result.structured_findings.findings)}):")
    for f in result.structured_findings.findings:
        icon = {"severe": "🔴", "moderate": "🟠", "mild": "🔵", "normal": "🟢"}.get(f.severity, "⚪")
        print(f"  {icon} [{f.confidence:.0%}] {f.description}")

    if result.confidence_warnings:
        print(f"\n⚠ WARNINGS ({len(result.confidence_warnings)}):")
        for w in result.confidence_warnings:
            print(f"  - {w}")

    print(f"\nREPORT:\n{result.narrative_report}")

    if args.output:
        output_data = asdict(result)
        output_data["triage"]["level"] = result.triage.level.value
        with open(args.output, "w") as f:
            json.dump(output_data, f, indent=2, default=str)
        print(f"\nResults saved to: {args.output}")


if __name__ == "__main__":
    demo()
