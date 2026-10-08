import { auth } from "./firebase-config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";


export function getGrade(percentage) {
    const val = typeof percentage === 'number' ? percentage : parseFloat(percentage || 0);
    if (val >= 90) return { grade: "A", label: "Grade A (90%+)", color: "#10b981", bg: "#064e3b" };
    if (val >= 80) return { grade: "B", label: "Grade B (80-89%)", color: "#3b82f6", bg: "#1e3a8a" };
    if (val >= 70) return { grade: "C", label: "Grade C (70-79%)", color: "#6366f1", bg: "#312e81" };
    if (val >= 60) return { grade: "D", label: "Grade D (60-69%)", color: "#f59e0b", bg: "#78350f" };
    if (val >= 40) return { grade: "E", label: "Grade E (40-59%)", color: "#ec4899", bg: "#831843" };
    return { grade: "Fail", label: "Fail (<40%)", color: "#ef4444", bg: "#7f1d1d" };
}


export function showToast(message, type = "info", duration = 3000) {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 380px;
        `;
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    const bgColor = type === "success" ? "#059669" : type === "error" ? "#dc2626" : "#2563eb";
    
    toast.style.cssText = `
        background-color: ${bgColor};
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        font-size: 0.9rem;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
        transition: opacity 0.3s ease;
        line-height: 1.4;
    `;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, duration);
}


export async function handleLogout() {
    if (!confirm("Are you sure you want to log out?")) return;
    try {
        await signOut(auth);
        window.location.href = "../login.html";
    } catch (err) {
        showToast("Error signing out: " + err.message, "error");
    }
}


export function drawPieChart(canvas, data) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 240;
    const height = canvas.clientHeight || 240;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const total = data.reduce((sum, item) => sum + (item.count || 0), 0);
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) - 16;
    const innerRadius = radius * 0.58;

    if (total === 0) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fillStyle = "#1a0f08";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#5c3317";
        ctx.stroke();

        ctx.fillStyle = "#c8854a";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("No graded exams", centerX, centerY);
        return;
    }

    let startAngle = -Math.PI / 2;

    data.forEach(slice => {
        if (!slice.count) return;
        const sliceAngle = (slice.count / total) * (Math.PI * 2);
        const endAngle = startAngle + sliceAngle;

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = slice.color;
        ctx.fill();

        ctx.lineWidth = 2;
        ctx.strokeStyle = "#1a0f08";
        ctx.stroke();

        startAngle = endAngle;
    });

    
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${total}`, centerX, centerY - 8);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px sans-serif";
    ctx.fillText("Exams", centerX, centerY + 12);
}


export function compressImage(file, maxDimension = 300, quality = 0.85) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith("image/")) {
            return reject(new Error("Please upload a valid image file."));
        }

        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = (e) => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxDimension) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    }
                } else {
                    if (height > maxDimension) {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL("image/jpeg", quality);
                resolve(dataUrl);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}
