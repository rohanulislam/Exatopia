import { getExamSubmissions } from "./exam.js";

let currentOverlay = null;

function onEsc(e) {
    if (e.key === "Escape") closeSubmissionsModal();
}

function formatTime(t) {
    if (!t) return "—";
    try {
        const d = t.toDate ? t.toDate() : new Date(t);
        return isNaN(d.getTime()) ? "—" : d.toLocaleString();
    } catch (e) {
        return "—";
    }
}

function escapeHtml(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function closeSubmissionsModal() {
    if (currentOverlay) {
        currentOverlay.remove();
        currentOverlay = null;
    }
    document.removeEventListener("keydown", onEsc);
}

export function showSubmissionsModal(examId, examTitle = "Exam") {
    if (!examId) return;
    closeSubmissionsModal();

    const overlay = document.createElement("div");
    overlay.id = "submissionsModalOverlay";
    overlay.style.cssText =
        "position:fixed;inset:0;background:rgba(15,8,3,0.85);backdrop-filter:blur(6px);" +
        "display:flex;align-items:center;justify-content:center;z-index:2000;padding:1rem;";

    overlay.innerHTML = `
        <div style="background:var(--bg-card);border:1px solid var(--border-md);border-radius:var(--radius-lg);padding:2rem;width:100%;max-width:880px;max-height:85vh;overflow:auto;box-shadow:var(--shadow-lg);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:1.25rem;">
                <div>
                    <h3 style="margin:0 0 0.25rem;color:var(--text-heading);font-size:1.15rem;">📥 Submissions</h3>
                    <p style="margin:0;color:var(--text-muted);font-size:0.88rem;">${escapeHtml(examTitle)}</p>
                </div>
                <button type="button" id="submissionsModalClose" style="background:none;border:none;color:var(--text-muted);font-size:1.5rem;cursor:pointer;line-height:1;padding:0;">&times;</button>
            </div>
            <div id="submissionsModalBody">
                <p style="color:var(--text-muted);font-size:0.9rem;">Loading submissions…</p>
            </div>
        </div>`;

    document.body.appendChild(overlay);
    currentOverlay = overlay;

    overlay.querySelector("#submissionsModalClose").addEventListener("click", closeSubmissionsModal);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeSubmissionsModal(); });
    document.addEventListener("keydown", onEsc);

    getExamSubmissions(examId).then((rows) => {
        const body = overlay.querySelector("#submissionsModalBody");
        if (!body) return;

        if (!rows || rows.length === 0) {
            body.innerHTML = `<p style="color:var(--text-muted);font-size:0.9rem;">No submissions yet for this exam.</p>`;
            return;
        }

        const th = "background:var(--bg-inset);color:var(--text-muted);padding:0.7rem 0.9rem;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid var(--border-md);text-align:left;white-space:nowrap;";
        const td = "padding:0.8rem 0.9rem;border-bottom:1px solid var(--border);vertical-align:middle;";

        body.innerHTML = `
            <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
                    <thead>
                        <tr>
                            <th style="${th}">Examinee</th>
                            <th style="${th}">Mark</th>
                            <th style="${th}">Grade</th>
                            <th style="${th}">Submission Time</th>
                            <th style="${th}">Violations</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((r) => `
                            <tr>
                                <td style="${td}">
                                    <div style="font-weight:700;color:var(--text-heading);">${escapeHtml(r.name)}</div>
                                    <div style="font-size:0.78rem;color:var(--text-muted);">${escapeHtml(r.email)}</div>
                                </td>
                                <td style="${td}font-weight:700;color:var(--brown-200);white-space:nowrap;">${r.score} / ${r.total} <span style="font-size:0.78rem;color:var(--text-muted);">(${r.percentage}%)</span></td>
                                <td style="${td}">
                                    <span style="display:inline-block;padding:0.2rem 0.6rem;border-radius:6px;font-weight:700;background:${r.gradeBg};color:${r.gradeColor};border:1px solid ${r.gradeColor};">${escapeHtml(r.grade)}</span>
                                </td>
                                <td style="${td}color:var(--text-main);white-space:nowrap;">${formatTime(r.submittedAt)}${r.autoSubmitted ? ` <span style="font-size:0.72rem;color:var(--text-muted);">⚡ auto</span>` : ""}</td>
                                <td style="${td}font-weight:700;white-space:nowrap;color:${r.violationCount > 0 ? "#f87171" : "var(--text-main)"};">${r.violationCount}${r.maxViolations ? ` / ${r.maxViolations}` : ""}</td>
                            </tr>`).join("")}
                    </tbody>
                </table>
            </div>
            <p style="margin:1rem 0 0;color:var(--text-muted);font-size:0.78rem;">${rows.length} submission(s)</p>`;
    }).catch((err) => {
        const body = overlay.querySelector("#submissionsModalBody");
        if (body) body.innerHTML = `<p style="color:#ef4444;font-size:0.9rem;">Could not load submissions: ${escapeHtml(err.message)}</p>`;
    });
}
