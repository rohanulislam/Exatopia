import { auth, db } from "./firebase-config.js";
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut,
    sendEmailVerification,
    sendPasswordResetEmail,
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    doc, 
    setDoc, 
    getDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


export async function createAuthAccount(name, email, password, role, institution = "Not specified") {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        try {
            await updateProfile(user, { displayName: name });
        } catch (pErr) {}
        return { user, role };
    } catch (error) {
        throw error;
    }
}


export async function finalizeRegistration(name, email, role, institution = "Not specified", uid = null) {
    const user = auth.currentUser;
    const finalUid = uid || (user ? user.uid : null);
    console.log("[register] uid argument:", uid, "| auth.currentUser:", user ? user.uid : null, "| finalUid:", finalUid);
    if (!finalUid) throw new Error("No authenticated user found.");

    await setDoc(doc(db, "users", finalUid), {
        name: name,
        email: email,
        role: role, 
        institution: institution || "Not specified",
        photoURL: null,
        createdAt: new Date().toISOString()
    });
}


export async function loginUser(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const role = userDoc.data().role;
            redirectByRole(role);
        } else {
            throw new Error("User profile record not found.");
        }
    } catch (error) {
        throw error;
    }
}


export async function sendPasswordReset(email) {
    if (!email) throw new Error("Please provide a valid email address.");
    await sendPasswordResetEmail(auth, email);
}


export async function sendVerificationLink() {
    const user = auth.currentUser;
    if (!user) throw new Error("No authenticated user found.");
    await sendEmailVerification(user);
}


export async function reauthenticateUser(currentPassword) {
    const user = auth.currentUser;
    if (!user || !user.email) throw new Error("User not authenticated.");
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    return await reauthenticateWithCredential(user, credential);
}


export async function updateUserProfile(currentPassword, updates = {}) {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated.");

    
    await reauthenticateUser(currentPassword);

    
    const authUpdates = {};
    if (updates.name) authUpdates.displayName = updates.name;
    if (updates.photoURL && updates.photoURL.startsWith("http")) {
        authUpdates.photoURL = updates.photoURL;
    }
    if (Object.keys(authUpdates).length > 0) {
        try {
            await updateProfile(user, authUpdates);
        } catch (authErr) {
            console.warn("Firebase Auth updateProfile skipped:", authErr.message);
        }
    }

    
    const firestoreUpdates = {
        updatedAt: new Date().toISOString()
    };
    if (updates.name !== undefined) firestoreUpdates.name = updates.name;
    if (updates.institution !== undefined) firestoreUpdates.institution = updates.institution;
    if (updates.photoURL !== undefined) firestoreUpdates.photoURL = updates.photoURL;

    await setDoc(doc(db, "users", user.uid), firestoreUpdates, { merge: true });

    return true;
}


export async function changeUserPassword(currentPassword, newPassword) {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated.");
    if (!newPassword || newPassword.length < 6) throw new Error("New password must be at least 6 characters.");

    
    await reauthenticateUser(currentPassword);

    
    await updatePassword(user, newPassword);
    return true;
}


export async function getUserProfile(uid = null) {
    const targetUid = uid || auth.currentUser?.uid;
    if (!targetUid) return null;

    try {
        const userDoc = await getDoc(doc(db, "users", targetUid));
        if (userDoc.exists()) {
            return { uid: targetUid, ...userDoc.data() };
        }
    } catch (e) {
        console.warn("Could not fetch user profile:", e);
    }

    
    const user = auth.currentUser;
    return {
        uid: targetUid,
        name: user?.displayName || "User",
        email: user?.email || "",
        institution: "Not specified",
        role: "student",
        photoURL: user?.photoURL || null
    };
}


export function redirectByRole(role) {
    if (role === "admin") {
        
        window.location.href = "admin/dashboard.html";
        return;
    }
    
    
    window.location.href = "../index.html";
}


export async function logoutUser() {
    const confirmed = await showLogoutDialog();
    if (!confirmed) return;
    await signOut(auth);
    const isRoot = !window.location.pathname.includes("/pages/");
    window.location.href = isRoot ? "pages/login.html" : "../login.html";
}

function showLogoutDialog() {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.setAttribute("style", [
            "position:fixed;inset:0;background:rgba(15,8,3,0.85);backdrop-filter:blur(6px);",
            "display:flex;align-items:center;justify-content:center;z-index:2000;",
            "opacity:0;transition:opacity 0.18s ease;"
        ].join(""));

        const box = document.createElement("div");
        box.setAttribute("style", [
            "background:linear-gradient(145deg, var(--bg-card, #2c1a0e) 0%, rgba(30,16,8,0.95) 100%);",
            "border:1px solid var(--border-md, rgba(200,133,74,0.35));border-radius:var(--radius-xl, 22px);",
            "padding:2rem 2.25rem;width:90%;max-width:380px;text-align:center;",
            "box-shadow:0 20px 50px rgba(0,0,0,0.6), 0 0 20px rgba(184,107,42,0.15);",
            "transform:translateY(8px) scale(0.97);transition:transform 0.18s ease;font-family:inherit;"
        ].join(""));

        box.innerHTML = `
            <div style="font-size:2.5rem;margin-bottom:0.6rem;">🚪</div>
            <h3 style="color:var(--text-heading, #faf4ed);font-size:1.3rem;font-weight:800;margin-bottom:0.4rem;">Sign out of Exatopia?</h3>
            <p style="color:var(--text-muted, #a08060);font-size:0.88rem;margin-bottom:1.75rem;line-height:1.5;">You'll need to sign in again to access your dashboard, exams, and viva sessions.</p>
            <div style="display:flex;gap:0.75rem;justify-content:center;">
                <button id="_logoutConfirm" style="background:linear-gradient(135deg,#991b1b 0%,#b91c1c 100%);color:#fff;border:1px solid #b91c1c;padding:0.65rem 1.5rem;border-radius:var(--radius-md, 10px);font-weight:700;cursor:pointer;font-family:inherit;font-size:0.9rem;box-shadow:0 2px 8px rgba(185,28,28,0.35);">Sign Out</button>
                <button id="_logoutCancel" style="background:var(--bg-inset, #3a2012);color:var(--brown-100, #f0ddc8);border:1px solid var(--border-md, rgba(200,133,74,0.35));padding:0.65rem 1.5rem;border-radius:var(--radius-md, 10px);font-weight:600;cursor:pointer;font-family:inherit;font-size:0.9rem;">Stay</button>
            </div>`;

        overlay.appendChild(box);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => {
            overlay.style.opacity = "1";
            box.style.transform = "translateY(0) scale(1)";
        });

        const close = (result) => {
            overlay.style.opacity = "0";
            box.style.transform = "translateY(8px) scale(0.97)";
            setTimeout(() => overlay.remove(), 180);
            resolve(result);
        };
        box.querySelector("#_logoutConfirm").addEventListener("click", () => close(true));
        box.querySelector("#_logoutCancel").addEventListener("click", () => close(false));
        overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
        document.addEventListener("keydown", function onEsc(e) {
            if (e.key === "Escape") { document.removeEventListener("keydown", onEsc); close(false); }
        });
    });
}