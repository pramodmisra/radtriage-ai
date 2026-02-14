"""
RadTriage AI — Gradio Demo Application
=======================================
Deploy on HuggingFace Spaces for public demo.

Usage:
    pip install gradio transformers torch pillow
    python app.py
"""

import json
import gradio as gr
from radtriage_pipeline import MedGemmaModel, RadTriagePipeline
from dataclasses import asdict
from PIL import Image

# ── Load Model ────────────────────────────────────────────────
print("Loading MedGemma model...")
model = MedGemmaModel()
model.load()
pipeline = RadTriagePipeline(model)
print("Model loaded. Ready for inference.")

# ── Modality Options ──────────────────────────────────────────
MODALITY_OPTIONS = [
    "Auto-detect",
    "Chest X-ray",
    "CT Head",
    "CT Chest",
    "MRI Brain",
    "Histopathology",
]

MODALITY_MAP = {
    "Auto-detect": None,
    "Chest X-ray": "chest_xray",
    "CT Head": "ct_head",
    "CT Chest": "ct_chest",
    "MRI Brain": "mri_brain",
    "Histopathology": "histopathology",
}


def analyze_image(image, modality, indication, priors, case_id):
    """Run the full RadTriage pipeline on an uploaded image."""
    if image is None:
        return "No image uploaded", "", "", "", ""

    # Convert to PIL if needed
    if not isinstance(image, Image.Image):
        image = Image.fromarray(image).convert("RGB")

    # Run pipeline
    result = pipeline.run(
        image=image,
        case_id=case_id or "DEMO-001",
        modality_hint=MODALITY_MAP.get(modality),
        clinical_indication=indication or "",
        prior_studies=priors or "None",
    )

    # Format triage output
    triage_emoji = {"CRITICAL": "🔴", "URGENT": "🟠", "ROUTINE": "🟢"}
    triage_text = (
        f"## {triage_emoji.get(result.triage.level.value, '⚪')} {result.triage.level.value}\n\n"
        f"**Time Sensitivity:** {result.triage.time_sensitivity}\n\n"
        f"**Rationale:** {result.triage.rationale}\n\n"
        f"**Recommended Actions:**\n"
    )
    for action in result.triage.recommended_actions:
        triage_text += f"- {action}\n"

    # Format findings
    findings_text = f"**Modality:** {result.structured_findings.modality_detected}\n"
    findings_text += f"**Image Quality:** {result.structured_findings.image_quality}\n"
    if result.structured_findings.quality_issues:
        findings_text += f"**Quality Issues:** {', '.join(result.structured_findings.quality_issues)}\n"
    findings_text += f"\n**Impression:** {result.structured_findings.overall_impression_category.upper()}\n\n"
    findings_text += "### Findings\n\n"

    for f in result.structured_findings.findings:
        sev_emoji = {"severe": "🔴", "moderate": "🟠", "mild": "🔵", "normal": "🟢"}.get(f.severity, "⚪")
        conf_bar = "█" * int(f.confidence * 10) + "░" * (10 - int(f.confidence * 10))
        findings_text += (
            f"{sev_emoji} **{f.description}**\n"
            f"   Location: {f.location} | Severity: {f.severity} | "
            f"Confidence: [{conf_bar}] {f.confidence:.0%}\n\n"
        )

    # Missing context
    if result.structured_findings.missing_context:
        findings_text += "### Missing Context Checklist\n\n"
        for item in result.structured_findings.missing_context:
            findings_text += f"- ☐ {item}\n"

    # Warnings
    warnings_text = ""
    if result.confidence_warnings:
        for w in result.confidence_warnings:
            warnings_text += f"⚠️ {w}\n\n"
    else:
        warnings_text = "✅ No calibration warnings."

    # JSON output
    output_json = json.dumps(asdict(result), indent=2, default=str)

    return (
        triage_text,
        findings_text,
        result.narrative_report,
        warnings_text,
        output_json,
    )


# ── Gradio Interface ──────────────────────────────────────────

DESCRIPTION = """
# 🏥 RadTriage AI
### Multimodal Radiology Triage & Report Drafting with MedGemma

**Two-pass pipeline** for reduced hallucination:
1. **Pass 1** → Structured findings extraction with confidence scores
2. **Pass 2** → Narrative report grounded in structured findings
3. **Triage** → CRITICAL / URGENT / ROUTINE classification with rationale

Built with [MedGemma](https://huggingface.co/google/medgemma-4b-it) from Google's Health AI Developer Foundations.

> ⚠️ **For demonstration purposes only. Not for clinical use.**
"""

with gr.Blocks(
    title="RadTriage AI",
    theme=gr.themes.Base(
        primary_hue="blue",
        secondary_hue="cyan",
        neutral_hue="slate",
        font=["IBM Plex Sans", "system-ui", "sans-serif"],
    ),
    css="""
    .triage-critical { background: #450a0a !important; border: 2px solid #ef4444 !important; }
    .triage-urgent { background: #451a03 !important; border: 2px solid #f59e0b !important; }
    .triage-routine { background: #052e16 !important; border: 2px solid #22c55e !important; }
    """,
) as demo:

    gr.Markdown(DESCRIPTION)

    with gr.Row():
        # Left column: Input
        with gr.Column(scale=1):
            gr.Markdown("### Input")
            image_input = gr.Image(type="pil", label="Upload Medical Image")
            modality_input = gr.Dropdown(
                choices=MODALITY_OPTIONS,
                value="Auto-detect",
                label="Imaging Modality",
            )
            indication_input = gr.Textbox(
                label="Clinical Indication",
                placeholder="e.g., Shortness of breath, productive cough x 3 days",
            )
            priors_input = gr.Textbox(
                label="Prior Studies",
                placeholder="e.g., CXR 2024-01-15, or 'None'",
                value="None",
            )
            case_id_input = gr.Textbox(
                label="Case ID",
                placeholder="e.g., CXR-2024-0847",
                value="DEMO-001",
            )
            analyze_btn = gr.Button(
                "🔬 Analyze with MedGemma",
                variant="primary",
                size="lg",
            )

        # Right column: Output
        with gr.Column(scale=2):
            gr.Markdown("### Results")
            with gr.Tabs():
                with gr.TabItem("🚨 Triage"):
                    triage_output = gr.Markdown(label="Triage Classification")

                with gr.TabItem("🔬 Structured Findings"):
                    findings_output = gr.Markdown(label="Pass 1: Structured Findings")

                with gr.TabItem("📝 Narrative Report"):
                    report_output = gr.Textbox(
                        label="Pass 2: Draft Radiology Report",
                        lines=20,
                        interactive=True,  # Allow editing
                    )

                with gr.TabItem("⚠️ Calibration"):
                    warnings_output = gr.Markdown(label="Confidence Warnings")

                with gr.TabItem("📊 Raw JSON"):
                    json_output = gr.Code(
                        label="Complete Pipeline Output",
                        language="json",
                    )

    # Connect
    analyze_btn.click(
        fn=analyze_image,
        inputs=[image_input, modality_input, indication_input, priors_input, case_id_input],
        outputs=[triage_output, findings_output, report_output, warnings_output, json_output],
    )

    # Examples
    gr.Markdown("### Example Cases")
    gr.Markdown(
        "Upload a medical image above, or use these sample cases for demonstration. "
        "Sample images from public datasets (NIH, RSNA) can be used."
    )


if __name__ == "__main__":
    demo.launch(share=True)
