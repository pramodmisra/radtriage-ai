# 🏥 RadTriage AI

**Multimodal Radiology Triage & Report Drafting with Modality-Aware Prompting**

> Built with [MedGemma](https://huggingface.co/google/medgemma-4b-it) from Google's Health AI Developer Foundations (HAI-DEF)
> for the [MedGemma Impact Challenge](https://www.kaggle.com/competitions/med-gemma-impact-challenge)

[![Demo](https://img.shields.io/badge/Demo-HuggingFace%20Spaces-blue)](https://huggingface.co/spaces/YOUR_USERNAME/radtriage-ai)
[![License](https://img.shields.io/badge/License-CC%20BY%204.0-green)](https://creativecommons.org/licenses/by/4.0/)

---

## What is RadTriage AI?

RadTriage AI is a **two-pass radiology analysis pipeline** that uses MedGemma to:

1. **Extract structured findings** from medical images with confidence scores (Pass 1)
2. **Generate narrative radiology reports** grounded in those findings — reducing hallucination (Pass 2)
3. **Classify triage urgency** (CRITICAL / URGENT / ROUTINE) with rationale
4. **Flag uncertainty** with calibrated "I don't know" responses and missing context checklists

### Key Differentiators

- **Two-pass generation** — structured intermediate representation prevents hallucinated prose
- **Modality-aware prompting** — specialized templates for Chest X-ray, CT Head, CT Chest, MRI Brain, Histopathology
- **Calibrated confidence** — the model says "I don't know" when it should, with actionable next steps
- **Clinical-realistic UI** — DICOM-style viewer, editable reports, simulated PACS/RIS integration

## Architecture

```
Medical Image ─┐
               ├──▶ [Pass 1: Structured Findings] ──▶ [Pass 2: Narrative Report]
Clinical Info ─┘          │                                      │
                          └──▶ [Triage Classifier] ◀─────────────┘
                          └──▶ [Confidence Calibration]
                          └──▶ [Missing Context Checklist]
```

## Quick Start

### Prerequisites

- Python 3.10+
- CUDA-compatible GPU (recommended: A100/V100 for 4B model)
- HuggingFace account with access to MedGemma

### Installation

```bash
git clone https://github.com/pramodmisra/radtriage-ai.git
cd radtriage-ai
pip install -r requirements.txt
```

### Run CLI

```bash
python radtriage_pipeline.py path/to/medical_image.jpg \
  --modality chest_xray \
  --indication "Shortness of breath" \
  --output results.json
```

### Run Gradio Demo

```bash
python app.py
```

### Run with Docker

```bash
docker build -t radtriage-ai .
docker run -p 7860:7860 --gpus all radtriage-ai
```

## Project Structure

```
radtriage-ai/
├── radtriage_pipeline.py    # Core two-pass pipeline
├── app.py                   # Gradio demo application
├── requirements.txt         # Python dependencies
├── Dockerfile               # Container deployment
├── LICENSE                  # CC BY 4.0
├── README.md
└── results/
    └── pipeline_results.json  # Sample pipeline outputs
```

## Supported Modalities

| Modality | Specific Checks | Status |
|----------|----------------|--------|
| Chest X-ray | Pneumothorax, effusion, consolidation, cardiomegaly, lines/tubes | ✅ |
| CT Head | Hemorrhage, mass effect, midline shift, hydrocephalus, fractures | ✅ |
| CT Chest | Nodules, ground glass, PE, lymphadenopathy | ✅ |
| MRI Brain | DWI restriction, enhancement, FLAIR hyperintensity | ✅ |
| Histopathology | Architecture, atypia, margins, grade | ✅ |
| Auto-detect | MedGemma identifies modality | ✅ |

## Competition Tracks

- **Main Track** — Full pipeline demonstration
- **Agentic Workflow Prize** — Two-pass agentic pipeline with modality routing and triage orchestration

## Disclaimer

⚠️ **This is a demonstration project for the MedGemma Impact Challenge. It is NOT intended for clinical use, diagnosis, or treatment decisions.** All medical image interpretations should be performed by qualified healthcare professionals.

## Citation

If you use this work, please cite:

```bibtex
@software{radtriage_ai_2026,
  title={RadTriage AI: Multimodal Radiology Triage & Report Drafting},
  author={[Pramod Misra]},
  year={2026},
  url={https://github.com/pramodmisra/radtriage-ai}
}
```

## License

CC BY 4.0 — as required by the MedGemma Impact Challenge rules.
