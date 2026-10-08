import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export function protectRoute(allowedRoles = []) {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            
            window.location.href = "/pages/login.html";
            return;
        }

        if (allowedRoles.length > 0) {
            
            
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (!userDoc.exists()) {
                window.location.href = "/pages/login.html";
            }
        }
    });
}