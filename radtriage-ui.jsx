import { useState, useEffect, useRef, useCallback } from "react";

// ─── MOCK DATA ─────────────────────────────────────────────────
const SAMPLE_CASES = [
  {
    id: "CXR-2024-0847",
    patient: "Patient A (Demo)",
    age: 67,
    sex: "M",
    modality: "Chest X-ray",
    indication: "Shortness of breath, productive cough x 3 days",
    priors: "CXR 2024-01-15",
    imageUrl: "chest_xray",
    color: "#1a1a2e",
  },
  {
    id: "CT-2024-1203",
    patient: "Patient B (Demo)",
    age: 45,
    sex: "F",
    modality: "CT Head",
    indication: "Acute onset headache, worst of life",
    priors: "None",
    imageUrl: "ct_head",
    color: "#0d1117",
  },
  {
    id: "MRI-2024-0592",
    patient: "Patient C (Demo)",
    age: 52,
    sex: "M",
    modality: "MRI Brain",
    indication: "New onset seizure, no prior history",
    priors: "None",
    imageUrl: "mri_brain",
    color: "#0a0a1a",
  },
];

const PASS1_RESULTS = {
  "CXR-2024-0847": {
    modality_detected: "Chest X-ray (PA)",
    anatomical_region: "Thorax",
    image_quality: "adequate",
    quality_issues: [],
    comparison_available: true,
    findings: [
      { id: 1, description: "Right lower lobe consolidation with air bronchograms", location: "Right lower lobe", severity: "moderate", confidence: 0.89 },
      { id: 2, description: "Small right-sided pleural effusion", location: "Right costophrenic angle", severity: "mild", confidence: 0.82 },
      { id: 3, description: "Stable cardiomegaly", location: "Cardiac silhouette", severity: "mild", confidence: 0.91 },
      { id: 4, description: "No pneumothorax identified", location: "Bilateral", severity: "normal", confidence: 0.95 },
      { id: 5, description: "Endotracheal tube in satisfactory position", location: "Trachea", severity: "normal", confidence: 0.88 },
    ],
    overall_impression_category: "abnormal",
    missing_context: ["Relevant lab values (WBC, procalcitonin)", "Oxygen saturation"],
  },
  "CT-2024-1203": {
    modality_detected: "CT Head (Non-contrast)",
    anatomical_region: "Brain",
    image_quality: "adequate",
    quality_issues: [],
    comparison_available: false,
    findings: [
      { id: 1, description: "Hyperdense focus in the right basal ganglia measuring ~2.3 cm, consistent with acute intraparenchymal hemorrhage", location: "Right basal ganglia", severity: "severe", confidence: 0.94 },
      { id: 2, description: "Surrounding vasogenic edema with mild local mass effect", location: "Right hemisphere", severity: "moderate", confidence: 0.87 },
      { id: 3, description: "3mm leftward midline shift at the level of the septum pellucidum", location: "Midline", severity: "moderate", confidence: 0.85 },
      { id: 4, description: "No intraventricular extension of hemorrhage", location: "Ventricular system", severity: "normal", confidence: 0.78 },
      { id: 5, description: "No acute hydrocephalus", location: "Ventricular system", severity: "normal", confidence: 0.82 },
    ],
    overall_impression_category: "critical",
    missing_context: ["Prior imaging for comparison", "Coagulation studies (INR, PTT)", "Blood pressure at time of scan", "GCS score"],
  },
  "MRI-2024-0592": {
    modality_detected: "MRI Brain (T1/T2/FLAIR/DWI)",
    anatomical_region: "Brain",
    image_quality: "suboptimal",
    quality_issues: ["Motion artifact on DWI sequence", "Incomplete fat saturation on post-contrast T1"],
    comparison_available: false,
    findings: [
      { id: 1, description: "Possible ring-enhancing lesion in right temporal lobe, ~1.8cm", location: "Right temporal lobe", severity: "moderate", confidence: 0.58 },
      { id: 2, description: "Surrounding FLAIR hyperintensity suggesting edema", location: "Right temporal lobe", severity: "mild", confidence: 0.72 },
      { id: 3, description: "Restricted diffusion at lesion periphery — cannot fully assess due to motion artifact", location: "Right temporal lobe", severity: "moderate", confidence: 0.42 },
      { id: 4, description: "No additional enhancing lesions identified", location: "Supratentorial and infratentorial", severity: "normal", confidence: 0.68 },
    ],
    overall_impression_category: "abnormal",
    missing_context: ["Repeat DWI without motion", "MR spectroscopy recommended", "Prior imaging for comparison", "HIV status / immunocompromised state", "Travel history"],
  },
};

const PASS2_REPORTS = {
  "CXR-2024-0847": `EXAMINATION: Chest radiograph, PA view

CLINICAL INDICATION: 67-year-old male with shortness of breath and productive cough for 3 days.

COMPARISON: Chest X-ray dated 2024-01-15.

FINDINGS:
The lungs demonstrate a region of consolidation in the right lower lobe with visible air bronchograms, consistent with pneumonia. A small right-sided pleural effusion is noted, new compared to prior study. The cardiac silhouette remains enlarged, stable compared to prior examination. No pneumothorax is identified. Lines and tubes: Endotracheal tube is present with tip approximately 4 cm above the carina, in satisfactory position. The mediastinal contours are within normal limits. Osseous structures are unremarkable.

IMPRESSION:
1. Right lower lobe consolidation with air bronchograms, most consistent with community-acquired pneumonia. New since prior study.
2. Small right-sided pleural effusion, new.
3. Stable cardiomegaly.
4. Endotracheal tube in satisfactory position.

RECOMMENDATION: Clinical correlation with laboratory findings. Follow-up imaging to document resolution if clinically indicated.`,

  "CT-2024-1203": `EXAMINATION: CT Head without contrast

CLINICAL INDICATION: 45-year-old female with acute onset headache, described as worst headache of life.

COMPARISON: None available.

FINDINGS:
There is a hyperdense focus in the right basal ganglia measuring approximately 2.3 cm in greatest dimension, consistent with acute intraparenchymal hemorrhage. Surrounding vasogenic edema is present with mild local mass effect on the adjacent right lateral ventricle. There is approximately 3 mm of leftward midline shift at the level of the septum pellucidum. No definite intraventricular extension of hemorrhage is identified, though trace layering in the occipital horn of the right lateral ventricle cannot be fully excluded. No acute hydrocephalus. The gray-white matter differentiation is otherwise preserved. No calvarial fracture.

IMPRESSION:
1. CRITICAL: Acute right basal ganglia hemorrhage (~2.3 cm) with surrounding edema and 3 mm leftward midline shift. Neurosurgical consultation recommended.
2. No definite intraventricular hemorrhage extension; however, close interval follow-up recommended.
3. No acute hydrocephalus.

RECOMMENDATION: URGENT neurosurgical consultation. CTA head and neck to evaluate for underlying vascular etiology. Repeat CT in 6-8 hours to assess for hemorrhage expansion.`,

  "MRI-2024-0592": `EXAMINATION: MRI Brain with and without contrast (T1, T2, FLAIR, DWI, post-contrast T1)

CLINICAL INDICATION: 52-year-old male with new onset seizure, no prior history.

COMPARISON: None available.

TECHNIQUE LIMITATION: Motion artifact on DWI sequence limits evaluation of diffusion characteristics. Incomplete fat saturation on post-contrast T1 images.

FINDINGS:
There is a possible ring-enhancing lesion in the right temporal lobe measuring approximately 1.8 cm. Surrounding FLAIR hyperintensity is present, suggesting perilesional edema. Evaluation of diffusion characteristics is limited by motion artifact; however, there is suggestion of restricted diffusion at the lesion periphery, which cannot be fully characterized. No additional enhancing lesions are identified in the supratentorial or infratentorial brain. The ventricles and sulci are age-appropriate. No acute hemorrhage. The major intracranial flow voids are preserved.

IMPRESSION:
1. Possible ring-enhancing right temporal lobe lesion (~1.8 cm) — differential includes high-grade glioma, metastasis, abscess, or demyelination. CANNOT FULLY CHARACTERIZE due to motion artifact on DWI.
2. Surrounding edema.

⚠ CONFIDENCE NOTICE: Key findings have suboptimal confidence (0.42-0.58) due to image quality limitations. Interpretation should be considered preliminary.

RECOMMENDATION:
- Repeat MRI with motion correction protocol (consider sedation)
- MR spectroscopy for metabolite characterization
- Consider MR perfusion
- Clinical correlation with immunocompromised status and travel history`,
};

const TRIAGE_DATA = {
  "CXR-2024-0847": { level: "URGENT", color: "#f59e0b", bgColor: "#451a03", rationale: "New consolidation consistent with pneumonia in intubated patient. Pleural effusion may progress. Requires attention within 2-4 hours for antibiotic adjustment and monitoring." },
  "CT-2024-1203": { level: "CRITICAL", color: "#ef4444", bgColor: "#450a0a", rationale: "Acute intraparenchymal hemorrhage with mass effect and midline shift. Requires immediate neurosurgical consultation and CTA for vascular evaluation. Risk of hemorrhage expansion." },
  "MRI-2024-0592": { level: "URGENT", color: "#f59e0b", bgColor: "#451a03", rationale: "Possible enhancing lesion — cannot fully characterize due to image quality. Needs repeat imaging with improved technique. New onset seizure with mass lesion requires timely workup." },
};

// ─── SIMULATED MEDICAL IMAGE CANVAS ────────────────────────────
function MedicalImageCanvas({ caseData, zoom, brightness, contrast }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const scale = zoom / 100;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-w / 2, -h / 2);
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;

    if (caseData.modality === "Chest X-ray") {
      // Thorax outline
      ctx.strokeStyle = `rgba(180,200,220,0.6)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.48, w * 0.38, h * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Lung fields
      const grad1 = ctx.createRadialGradient(w * 0.35, h * 0.4, 10, w * 0.35, h * 0.4, w * 0.18);
      grad1.addColorStop(0, "rgba(60,70,85,0.9)");
      grad1.addColorStop(1, "rgba(30,35,45,0.5)");
      ctx.fillStyle = grad1;
      ctx.beginPath();
      ctx.ellipse(w * 0.35, h * 0.4, w * 0.16, h * 0.28, -0.1, 0, Math.PI * 2);
      ctx.fill();
      const grad2 = ctx.createRadialGradient(w * 0.65, h * 0.4, 10, w * 0.65, h * 0.4, w * 0.18);
      grad2.addColorStop(0, "rgba(60,70,85,0.9)");
      grad2.addColorStop(1, "rgba(30,35,45,0.5)");
      ctx.fillStyle = grad2;
      ctx.beginPath();
      ctx.ellipse(w * 0.65, h * 0.4, w * 0.15, h * 0.28, 0.1, 0, Math.PI * 2);
      ctx.fill();
      // Heart shadow
      const heartGrad = ctx.createRadialGradient(w * 0.45, h * 0.52, 5, w * 0.45, h * 0.52, w * 0.13);
      heartGrad.addColorStop(0, "rgba(140,145,160,0.8)");
      heartGrad.addColorStop(1, "rgba(80,85,100,0.3)");
      ctx.fillStyle = heartGrad;
      ctx.beginPath();
      ctx.ellipse(w * 0.45, h * 0.52, w * 0.12, h * 0.16, -0.15, 0, Math.PI * 2);
      ctx.fill();
      // RLL consolidation
      ctx.fillStyle = "rgba(180,170,155,0.5)";
      ctx.beginPath();
      ctx.ellipse(w * 0.62, h * 0.6, w * 0.08, h * 0.09, 0.2, 0, Math.PI * 2);
      ctx.fill();
      // Pleural effusion
      ctx.fillStyle = "rgba(120,125,140,0.4)";
      ctx.beginPath();
      ctx.moveTo(w * 0.52, h * 0.75);
      ctx.quadraticCurveTo(w * 0.65, h * 0.72, w * 0.78, h * 0.78);
      ctx.lineTo(w * 0.78, h * 0.82);
      ctx.quadraticCurveTo(w * 0.65, h * 0.80, w * 0.52, h * 0.82);
      ctx.fill();
      // Spine
      ctx.strokeStyle = "rgba(160,165,175,0.3)";
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.12);
      ctx.lineTo(w * 0.5, h * 0.85);
      ctx.stroke();
      // Ribs
      ctx.strokeStyle = "rgba(150,155,165,0.2)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const y = h * (0.22 + i * 0.065);
        ctx.beginPath();
        ctx.moveTo(w * 0.42, y);
        ctx.quadraticCurveTo(w * 0.25, y + 15, w * 0.18, y + 25);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w * 0.58, y);
        ctx.quadraticCurveTo(w * 0.75, y + 15, w * 0.82, y + 25);
        ctx.stroke();
      }
      // ET tube
      ctx.strokeStyle = "rgba(200,200,210,0.6)";
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(w * 0.48, h * 0.08);
      ctx.lineTo(w * 0.49, h * 0.28);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (caseData.modality === "CT Head") {
      // Skull outline
      ctx.strokeStyle = "rgba(200,200,210,0.5)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.45, w * 0.35, h * 0.38, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Brain parenchyma
      const brainGrad = ctx.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h * 0.45, w * 0.32);
      brainGrad.addColorStop(0, "rgba(100,105,115,0.8)");
      brainGrad.addColorStop(0.7, "rgba(70,75,85,0.6)");
      brainGrad.addColorStop(1, "rgba(50,55,65,0.4)");
      ctx.fillStyle = brainGrad;
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.45, w * 0.33, h * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      // Ventricles
      ctx.fillStyle = "rgba(30,32,40,0.7)";
      ctx.beginPath();
      ctx.ellipse(w * 0.42, h * 0.4, w * 0.04, h * 0.08, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(w * 0.58, h * 0.4, w * 0.04, h * 0.08, 0.2, 0, Math.PI * 2);
      ctx.fill();
      // HEMORRHAGE — bright hyperdense focus
      const hemoGrad = ctx.createRadialGradient(w * 0.6, h * 0.42, 3, w * 0.6, h * 0.42, w * 0.06);
      hemoGrad.addColorStop(0, "rgba(240,235,220,0.95)");
      hemoGrad.addColorStop(0.6, "rgba(210,200,180,0.8)");
      hemoGrad.addColorStop(1, "rgba(160,155,140,0.3)");
      ctx.fillStyle = hemoGrad;
      ctx.beginPath();
      ctx.ellipse(w * 0.6, h * 0.42, w * 0.055, h * 0.05, 0.3, 0, Math.PI * 2);
      ctx.fill();
      // Edema
      ctx.fillStyle = "rgba(85,90,100,0.4)";
      ctx.beginPath();
      ctx.ellipse(w * 0.6, h * 0.42, w * 0.1, h * 0.09, 0.2, 0, Math.PI * 2);
      ctx.fill();
      // Midline
      ctx.strokeStyle = "rgba(200,200,210,0.25)";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.1);
      ctx.lineTo(w * 0.5, h * 0.8);
      ctx.stroke();
      ctx.setLineDash([]);
      // Shifted midline
      ctx.strokeStyle = "rgba(255,100,100,0.5)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(w * 0.49, h * 0.1);
      ctx.quadraticCurveTo(w * 0.475, h * 0.45, w * 0.49, h * 0.8);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // MRI Brain
      ctx.strokeStyle = "rgba(180,190,200,0.4)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.45, w * 0.34, h * 0.37, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Brain
      const mriGrad = ctx.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h * 0.45, w * 0.31);
      mriGrad.addColorStop(0, "rgba(140,145,155,0.7)");
      mriGrad.addColorStop(0.5, "rgba(95,100,110,0.6)");
      mriGrad.addColorStop(1, "rgba(60,65,75,0.4)");
      ctx.fillStyle = mriGrad;
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.45, w * 0.32, h * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      // Sulci pattern
      ctx.strokeStyle = "rgba(50,55,65,0.3)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const r1 = w * 0.15;
        const r2 = w * 0.3;
        ctx.beginPath();
        ctx.moveTo(w / 2 + Math.cos(angle) * r1, h * 0.45 + Math.sin(angle) * r1 * 0.95);
        ctx.quadraticCurveTo(
          w / 2 + Math.cos(angle + 0.1) * (r1 + r2) / 2,
          h * 0.45 + Math.sin(angle + 0.1) * (r1 + r2) / 2 * 0.95,
          w / 2 + Math.cos(angle) * r2,
          h * 0.45 + Math.sin(angle) * r2 * 0.95
        );
        ctx.stroke();
      }
      // Lesion (ring-enhancing)
      ctx.strokeStyle = "rgba(220,210,190,0.7)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(w * 0.6, h * 0.5, w * 0.045, h * 0.04, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(50,55,60,0.6)";
      ctx.beginPath();
      ctx.ellipse(w * 0.6, h * 0.5, w * 0.03, h * 0.025, 0, 0, Math.PI * 2);
      ctx.fill();
      // FLAIR edema
      ctx.fillStyle = "rgba(160,165,175,0.3)";
      ctx.beginPath();
      ctx.ellipse(w * 0.6, h * 0.5, w * 0.09, h * 0.07, 0.1, 0, Math.PI * 2);
      ctx.fill();
      // Motion artifact lines
      ctx.strokeStyle = "rgba(180,180,190,0.15)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const y = h * (0.3 + i * 0.08);
        ctx.beginPath();
        ctx.moveTo(w * 0.15, y);
        ctx.lineTo(w * 0.85, y);
        ctx.stroke();
      }
    }

    ctx.restore();

    // DICOM overlay text
    ctx.filter = "none";
    ctx.fillStyle = "rgba(0,200,100,0.8)";
    ctx.font = "11px monospace";
    ctx.fillText(caseData.id, 8, 16);
    ctx.fillText(caseData.modality, 8, 30);
    ctx.fillText(`${caseData.age}${caseData.sex}`, 8, 44);
    ctx.fillText(`W:${brightness} L:${contrast}`, w - 75, 16);
    ctx.fillText(`Zoom: ${zoom}%`, w - 75, 30);

    const now = new Date();
    ctx.fillText(now.toLocaleDateString(), w - 85, h - 20);
    ctx.fillText(now.toLocaleTimeString(), w - 85, h - 8);
  }, [caseData, zoom, brightness, contrast]);

  return <canvas ref={canvasRef} width={480} height={520} style={{ width: "100%", height: "100%", objectFit: "contain" }} />;
}

// ─── CONFIDENCE BAR ────────────────────────────────────────────
function ConfidenceBar({ value }) {
  const color = value >= 0.8 ? "#22c55e" : value >= 0.6 ? "#f59e0b" : "#ef4444";
  const label = value >= 0.8 ? "High" : value >= 0.6 ? "Moderate" : "Low";
  return (
    <div className="flex items-center gap-2">
      <div style={{ width: 60, height: 6, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${value * 100}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.5s ease" }} />
      </div>
      <span style={{ color, fontSize: 11, fontWeight: 600 }}>{label} ({(value * 100).toFixed(0)}%)</span>
    </div>
  );
}

// ─── MAIN APP ──────────────────────────────────────────────────
export default function RadTriageAI() {
  const [selectedCase, setSelectedCase] = useState(0);
  const [activeTab, setActiveTab] = useState("viewer");
  const [pipelineStage, setPipelineStage] = useState("idle"); // idle, pass1, pass2, triage, done
  const [showPass1, setShowPass1] = useState(false);
  const [showPass2, setShowPass2] = useState(false);
  const [showTriage, setShowTriage] = useState(false);
  const [reportText, setReportText] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [statusLog, setStatusLog] = useState([]);
  const [pacsStatus, setPacsStatus] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const currentCase = SAMPLE_CASES[selectedCase];
  const pass1 = PASS1_RESULTS[currentCase.id];
  const pass2 = PASS2_REPORTS[currentCase.id];
  const triage = TRIAGE_DATA[currentCase.id];

  const addLog = useCallback((msg) => {
    setStatusLog((prev) => [...prev.slice(-15), { time: new Date().toLocaleTimeString(), msg }]);
  }, []);

  const runPipeline = useCallback(async () => {
    setPipelineStage("pass1");
    setShowPass1(false);
    setShowPass2(false);
    setShowTriage(false);
    setReportText("");
    setPacsStatus(null);
    addLog("Pipeline started — loading MedGemma multimodal...");
    addLog(`Modality detected: ${pass1.modality_detected}`);
    addLog("Applying modality-aware prompt template...");

    await new Promise((r) => setTimeout(r, 1800));
    addLog("PASS 1: Structured findings extraction complete");
    setShowPass1(true);
    setPipelineStage("pass2");

    await new Promise((r) => setTimeout(r, 1500));
    addLog("PASS 2: Narrative report generated from structured findings");
    setShowPass2(true);
    setReportText(pass2);
    setPipelineStage("triage");

    await new Promise((r) => setTimeout(r, 1200));
    addLog(`TRIAGE: ${triage.level} — ${triage.rationale.slice(0, 60)}...`);
    setShowTriage(true);
    setPipelineStage("done");
    addLog("Pipeline complete. Report ready for review.");
  }, [pass1, pass2, triage, addLog]);

  const resetPipeline = () => {
    setPipelineStage("idle");
    setShowPass1(false);
    setShowPass2(false);
    setShowTriage(false);
    setReportText("");
    setStatusLog([]);
    setPacsStatus(null);
    setEditMode(false);
    setZoom(100);
    setBrightness(100);
    setContrast(100);
  };

  useEffect(() => {
    resetPipeline();
  }, [selectedCase]);

  const sendToPacs = () => {
    setPacsStatus("sending");
    addLog("Sending finalized report to PACS/RIS...");
    setTimeout(() => {
      setPacsStatus("sent");
      addLog("Report successfully transmitted to PACS. Confirmation ID: RPT-" + Math.random().toString(36).slice(2, 8).toUpperCase());
    }, 2000);
  };

  const severityColor = (s) => {
    if (s === "severe") return "#ef4444";
    if (s === "moderate") return "#f59e0b";
    if (s === "mild") return "#3b82f6";
    return "#22c55e";
  };

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', 'SF Pro Display', -apple-system, sans-serif", background: "#050510", color: "#e2e8f0", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ── TOP BAR ────────────────────────────── */}
      <div style={{ background: "linear-gradient(90deg, #0a0a1a 0%, #0f172a 100%)", borderBottom: "1px solid #1e293b", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #06b6d4, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#fff" }}>RT</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>RadTriage AI</div>
            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase" }}>Multimodal Radiology Triage & Report Drafting</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 11, color: "#64748b", padding: "4px 10px", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6 }}>
            MedGemma 4B-IT
          </div>
          {showTriage && (
            <div style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700, color: triage.color, background: triage.bgColor, border: `1px solid ${triage.color}40`, animation: "pulse 2s infinite" }}>
              {triage.level}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* ── LEFT SIDEBAR — CASE LIST ────────── */}
        <div style={{ width: 220, background: "#0a0a1a", borderRight: "1px solid #1e293b", overflowY: "auto", flexShrink: 0 }}>
          <div style={{ padding: "14px 14px 8px", fontSize: 10, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Worklist
          </div>
          {SAMPLE_CASES.map((c, i) => (
            <div
              key={c.id}
              onClick={() => setSelectedCase(i)}
              style={{
                padding: "12px 14px",
                cursor: "pointer",
                borderLeft: selectedCase === i ? "3px solid #3b82f6" : "3px solid transparent",
                background: selectedCase === i ? "#1e293b40" : "transparent",
                transition: "all 0.15s",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: selectedCase === i ? "#e2e8f0" : "#94a3b8" }}>{c.id}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{c.modality}</div>
              <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{c.age}{c.sex} — {c.indication.slice(0, 30)}...</div>
            </div>
          ))}
          <div style={{ padding: "14px", borderTop: "1px solid #1e293b", marginTop: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Pipeline Status</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {["pass1", "pass2", "triage"].map((stage, idx) => {
                const labels = ["Pass 1: Findings", "Pass 2: Report", "Triage"];
                const active = pipelineStage === stage;
                const done = ["pass2", "triage", "done"].indexOf(pipelineStage) > idx - 1 && pipelineStage !== "idle";
                return (
                  <div key={stage} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: done ? "#22c55e" : active ? "#f59e0b" : "#334155",
                      boxShadow: active ? "0 0 6px #f59e0b" : "none",
                      transition: "all 0.3s"
                    }} />
                    <span style={{ fontSize: 11, color: done ? "#22c55e" : active ? "#f59e0b" : "#475569" }}>{labels[idx]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── MAIN CONTENT ──────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Tab bar */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #1e293b", background: "#0a0a1a" }}>
            {[
              { id: "viewer", label: "Image Viewer" },
              { id: "findings", label: "Structured Findings", badge: showPass1 },
              { id: "report", label: "Draft Report", badge: showPass2 },
              { id: "triage", label: "Triage", badge: showTriage },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "10px 18px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "none",
                  borderBottom: activeTab === tab.id ? "2px solid #3b82f6" : "2px solid transparent",
                  background: "none",
                  color: activeTab === tab.id ? "#e2e8f0" : "#64748b",
                  transition: "all 0.15s",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {tab.label}
                {tab.badge && (
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
                )}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: 0 }}>
            {/* ── VIEWER TAB ──── */}
            {activeTab === "viewer" && (
              <div style={{ display: "flex", height: "100%" }}>
                <div style={{ flex: 1, background: "#000", display: "flex", flexDirection: "column" }}>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
                    <MedicalImageCanvas caseData={currentCase} zoom={zoom} brightness={brightness} contrast={contrast} />
                  </div>
                  {/* Image controls */}
                  <div style={{ padding: "8px 16px", background: "#0a0a1a", borderTop: "1px solid #1e293b", display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
                    {[
                      { label: "Zoom", value: zoom, set: setZoom, min: 50, max: 200 },
                      { label: "Brightness", value: brightness, set: setBrightness, min: 50, max: 200 },
                      { label: "Contrast", value: contrast, set: setContrast, min: 50, max: 200 },
                    ].map(({ label, value, set, min, max }) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, color: "#64748b", width: 60 }}>{label}</span>
                        <input type="range" min={min} max={max} value={value} onChange={(e) => set(Number(e.target.value))}
                          style={{ width: 80, accentColor: "#3b82f6" }} />
                        <span style={{ fontSize: 10, color: "#94a3b8", width: 30 }}>{value}%</span>
                      </div>
                    ))}
                    <button onClick={() => { setZoom(100); setBrightness(100); setContrast(100); }}
                      style={{ marginLeft: "auto", padding: "4px 10px", fontSize: 10, background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: 4, cursor: "pointer" }}>
                      Reset
                    </button>
                  </div>
                </div>
                {/* Patient info sidebar */}
                <div style={{ width: 260, background: "#0a0a1a", borderLeft: "1px solid #1e293b", padding: 16, overflowY: "auto" }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Patient Context</div>
                  {[
                    ["Study ID", currentCase.id],
                    ["Modality", currentCase.modality],
                    ["Age / Sex", `${currentCase.age} / ${currentCase.sex}`],
                    ["Indication", currentCase.indication],
                    ["Prior Studies", currentCase.priors],
                  ].map(([k, v]) => (
                    <div key={k} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>{k}</div>
                      <div style={{ fontSize: 12, color: "#cbd5e1" }}>{v}</div>
                    </div>
                  ))}
                  <div style={{ borderTop: "1px solid #1e293b", paddingTop: 16, marginTop: 8 }}>
                    <button
                      onClick={runPipeline}
                      disabled={pipelineStage !== "idle"}
                      style={{
                        width: "100%",
                        padding: "10px 16px",
                        fontSize: 13,
                        fontWeight: 700,
                        borderRadius: 8,
                        border: "none",
                        cursor: pipelineStage === "idle" ? "pointer" : "not-allowed",
                        background: pipelineStage === "idle"
                          ? "linear-gradient(135deg, #06b6d4, #3b82f6)"
                          : pipelineStage === "done" ? "#1e293b" : "linear-gradient(135deg, #f59e0b, #d97706)",
                        color: "#fff",
                        transition: "all 0.2s",
                        opacity: pipelineStage === "idle" ? 1 : 0.8,
                      }}
                    >
                      {pipelineStage === "idle" ? "▶  Analyze with MedGemma" : pipelineStage === "done" ? "✓ Analysis Complete" : "⟳ Processing..."}
                    </button>
                    {pipelineStage === "done" && (
                      <button onClick={resetPipeline} style={{ width: "100%", marginTop: 8, padding: "7px 16px", fontSize: 11, background: "none", border: "1px solid #334155", borderRadius: 6, color: "#64748b", cursor: "pointer" }}>
                        Reset Pipeline
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── FINDINGS TAB ──── */}
            {activeTab === "findings" && (
              <div style={{ padding: 20, maxWidth: 900 }}>
                {!showPass1 ? (
                  <div style={{ textAlign: "center", padding: 60, color: "#475569" }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🔬</div>
                    <div style={{ fontSize: 14 }}>Run the pipeline to extract structured findings</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Go to Image Viewer tab and click "Analyze with MedGemma"</div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>Pass 1: Structured Findings</div>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Extracted by MedGemma multimodal with modality-aware prompting</div>
                      </div>
                      <div style={{ padding: "4px 10px", background: "#1e293b", borderRadius: 6, fontSize: 11, color: "#94a3b8" }}>
                        {pass1.modality_detected}
                      </div>
                    </div>

                    {/* Image Quality Alert */}
                    {pass1.image_quality !== "adequate" && (
                      <div style={{ padding: "10px 14px", background: "#451a0320", border: "1px solid #f59e0b30", borderRadius: 8, marginBottom: 16, display: "flex", gap: 10 }}>
                        <span style={{ color: "#f59e0b", fontSize: 16 }}>⚠</span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#f59e0b" }}>Image Quality: {pass1.image_quality}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{pass1.quality_issues.join("; ")}</div>
                        </div>
                      </div>
                    )}

                    {/* Findings */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {pass1.findings.map((f) => (
                        <div key={f.id} style={{ padding: "12px 16px", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, borderLeft: `3px solid ${severityColor(f.severity)}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 4 }}>{f.description}</div>
                              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                <span style={{ fontSize: 11, color: "#64748b" }}>📍 {f.location}</span>
                                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${severityColor(f.severity)}20`, color: severityColor(f.severity), fontWeight: 600, textTransform: "uppercase" }}>
                                  {f.severity}
                                </span>
                              </div>
                            </div>
                            <ConfidenceBar value={f.confidence} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Missing Context */}
                    {pass1.missing_context.length > 0 && (
                      <div style={{ marginTop: 20, padding: 16, background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b", marginBottom: 10 }}>📋 Missing Context Checklist</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>The following information would improve diagnostic confidence:</div>
                        {pass1.missing_context.map((item, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                            <div style={{ width: 16, height: 16, borderRadius: 3, border: "1.5px solid #475569", flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: "#cbd5e1" }}>{item}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── REPORT TAB ──── */}
            {activeTab === "report" && (
              <div style={{ padding: 20, maxWidth: 900 }}>
                {!showPass2 ? (
                  <div style={{ textAlign: "center", padding: 60, color: "#475569" }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
                    <div style={{ fontSize: 14 }}>Draft report will appear after pipeline completes Pass 2</div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>Pass 2: Narrative Report</div>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Generated from structured findings — reduce hallucination via grounded generation</div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setEditMode(!editMode)} style={{ padding: "6px 14px", fontSize: 11, fontWeight: 600, background: editMode ? "#3b82f6" : "#1e293b", color: editMode ? "#fff" : "#94a3b8", border: `1px solid ${editMode ? "#3b82f6" : "#334155"}`, borderRadius: 6, cursor: "pointer" }}>
                          {editMode ? "✓ Done Editing" : "✏️ Edit Report"}
                        </button>
                      </div>
                    </div>
                    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, overflow: "hidden" }}>
                      <div style={{ padding: "8px 16px", background: "#1e293b40", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b" }}>
                        <span>RADIOLOGY REPORT — {currentCase.id}</span>
                        <span>{editMode ? "EDITING" : "READ ONLY"}</span>
                      </div>
                      {editMode ? (
                        <textarea
                          value={reportText}
                          onChange={(e) => setReportText(e.target.value)}
                          style={{ width: "100%", minHeight: 400, padding: 16, background: "#0f172a", color: "#e2e8f0", border: "none", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, lineHeight: 1.7, resize: "vertical", outline: "none", boxSizing: "border-box" }}
                        />
                      ) : (
                        <pre style={{ padding: 16, margin: 0, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, lineHeight: 1.7, color: "#cbd5e1", whiteSpace: "pre-wrap", wordWrap: "break-word" }}>
                          {reportText}
                        </pre>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                      <button
                        onClick={sendToPacs}
                        disabled={pacsStatus === "sending" || pacsStatus === "sent"}
                        style={{
                          padding: "10px 20px",
                          fontSize: 12,
                          fontWeight: 700,
                          borderRadius: 8,
                          border: "none",
                          cursor: pacsStatus ? "not-allowed" : "pointer",
                          background: pacsStatus === "sent" ? "#166534" : pacsStatus === "sending" ? "#1e293b" : "linear-gradient(135deg, #06b6d4, #3b82f6)",
                          color: "#fff",
                        }}
                      >
                        {pacsStatus === "sent" ? "✓ Sent to PACS/RIS" : pacsStatus === "sending" ? "Sending..." : "📤 Send to PACS/RIS"}
                      </button>
                      <button style={{ padding: "10px 20px", fontSize: 12, background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: 8, cursor: "pointer" }}>
                        🖨 Print Report
                      </button>
                      <button style={{ padding: "10px 20px", fontSize: 12, background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: 8, cursor: "pointer" }}>
                        📎 Attach Addendum
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── TRIAGE TAB ──── */}
            {activeTab === "triage" && (
              <div style={{ padding: 20, maxWidth: 900 }}>
                {!showTriage ? (
                  <div style={{ textAlign: "center", padding: 60, color: "#475569" }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🚨</div>
                    <div style={{ fontSize: 14 }}>Triage classification will appear after pipeline completes</div>
                  </div>
                ) : (
                  <>
                    {/* Triage Banner */}
                    <div style={{ padding: 24, borderRadius: 12, background: triage.bgColor, border: `2px solid ${triage.color}40`, marginBottom: 20, textAlign: "center" }}>
                      <div style={{ fontSize: 40, fontWeight: 800, color: triage.color, letterSpacing: "0.05em" }}>
                        {triage.level === "CRITICAL" ? "🔴" : "🟠"} {triage.level}
                      </div>
                      <div style={{ fontSize: 13, color: "#cbd5e1", marginTop: 8, maxWidth: 600, margin: "8px auto 0" }}>
                        {triage.rationale}
                      </div>
                    </div>

                    {/* Findings severity breakdown */}
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Severity Breakdown</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
                      {["severe", "moderate", "mild", "normal"].map((sev) => {
                        const count = pass1.findings.filter((f) => f.severity === sev).length;
                        return (
                          <div key={sev} style={{ padding: "12px 16px", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, textAlign: "center" }}>
                            <div style={{ fontSize: 24, fontWeight: 800, color: severityColor(sev) }}>{count}</div>
                            <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", fontWeight: 600, marginTop: 4 }}>{sev}</div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Calibration notice */}
                    {pass1.findings.some((f) => f.confidence < 0.6) && (
                      <div style={{ padding: 16, background: "#0f172a", border: "1px solid #f59e0b30", borderRadius: 8, marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b", marginBottom: 8 }}>
                          ⚠ Calibration Notice — Low Confidence Findings
                        </div>
                        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
                          One or more findings have confidence below 60%. The model recommends the following actions:
                        </div>
                        {pass1.findings.filter((f) => f.confidence < 0.6).map((f) => (
                          <div key={f.id} style={{ padding: "8px 12px", background: "#1e293b40", borderRadius: 6, marginBottom: 6 }}>
                            <div style={{ fontSize: 12, color: "#e2e8f0" }}>{f.description}</div>
                            <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 4 }}>
                              → Confidence: {(f.confidence * 100).toFixed(0)}% — Recommend additional imaging or clinical correlation
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Missing context */}
                    {pass1.missing_context.length > 0 && (
                      <div style={{ padding: 16, background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#3b82f6", marginBottom: 10 }}>📋 Recommended Next Steps</div>
                        {pass1.missing_context.map((item, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < pass1.missing_context.length - 1 ? "1px solid #1e293b40" : "none" }}>
                            <span style={{ color: "#3b82f6", fontSize: 14 }}>→</span>
                            <span style={{ fontSize: 12, color: "#cbd5e1" }}>{item}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── BOTTOM LOG ──── */}
          {statusLog.length > 0 && (
            <div style={{ height: 90, borderTop: "1px solid #1e293b", background: "#050510", overflowY: "auto", padding: "6px 14px" }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Pipeline Log</div>
              {statusLog.map((l, i) => (
                <div key={i} style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace", lineHeight: 1.5 }}>
                  <span style={{ color: "#475569" }}>[{l.time}]</span> {l.msg}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0a0a1a; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        input[type="range"] { height: 4px; }
      `}</style>
    </div>
  );
}
