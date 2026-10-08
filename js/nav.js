
import { logoutUser } from "./auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { auth, db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.getElementById("menuToggle");
    const links = document.getElementById("navLinks");
    if (toggle && links) {
        toggle.addEventListener("click", () => {
            links.classList.toggle("open");
        });
    }

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            logoutUser();
        });
    }

    auth.authStateReady().then(() => onAuthStateChanged(auth, async (user) => {
        const linksWrap = document.getElementById("navLinks");
        if (!linksWrap) return;

        let isLoggedIn = false;
        let isAdmin = false;
        if (user) {
            try {
                const snap = await getDoc(doc(db, "users", user.uid));
                isLoggedIn = snap.exists();
                isAdmin = isLoggedIn && snap.data().role === "admin";
            } catch (e) {
                isAdmin = false;
            }
        }

        Array.from(linksWrap.children).forEach(el => {
            if (el.tagName === "BUTTON") return; 
            const label = el.textContent.trim();
            const href = el.getAttribute("href") || "";
            const isAdminLink = href.includes("admin");
            let show;
            if (isLoggedIn && isAdmin) {
                
                show = isAdminLink;
            } else if (label === "Sign In" || label === "Login" || label === "Register" || label === "Sign Up") {
                show = !isLoggedIn;
            } else if (label === "Home") {
                show = true;
            } else if (isAdminLink) {
                show = false; 
            } else {
                show = isLoggedIn;
            }
            el.style.display = show ? "" : "none";
        });

        
        linksWrap.style.visibility = "visible";
        currentIsAdmin = isAdmin;
        syncAdminLogo();

        if (logoutBtn) {
            logoutBtn.textContent = "Sign Out";
            logoutBtn.style.display = isLoggedIn ? "inline-block" : "none";
        }

        
        lastIsLoggedIn = isLoggedIn;
        syncHeroButtons();
    }));

    
    function updateActiveNav() {
        const current = window.location.pathname.replace(/\/+$/, "");
        document.querySelectorAll("#navLinks a").forEach(a => {
            const raw = a.getAttribute("href").split("?")[0];
            const idx = raw.indexOf("pages/");
            const target = idx >= 0 ? raw.slice(idx) : raw.split("/").pop();
            const isRootHome = target === "index.html" && (current === "" || current.endsWith("/index.html") || current.endsWith("index.html"));
            a.classList.toggle("active", isRootHome ? true : (target !== "" && current.endsWith(target)));
        });
    }

    
    let currentIsAdmin = false;
    let lastIsLoggedIn = null;
    function syncHeroButtons() {
        if (lastIsLoggedIn === null) return;
        const isLoggedIn = lastIsLoggedIn;
        const heroSignInBtn = document.getElementById("heroSignInBtn");
        const heroRegisterBtn = document.getElementById("heroRegisterBtn");
        const heroDashboardBtn = document.getElementById("heroDashboardBtn");
        const ctaRegisterBtn = document.getElementById("ctaRegisterBtn");
        const ctaDashboardBtn = document.getElementById("ctaDashboardBtn");

        if (heroSignInBtn) heroSignInBtn.style.display = isLoggedIn ? "none" : "inline-block";
        if (heroRegisterBtn) heroRegisterBtn.style.display = isLoggedIn ? "none" : "inline-block";
        if (heroDashboardBtn) heroDashboardBtn.style.display = isLoggedIn ? "inline-block" : "none";

        if (ctaRegisterBtn) ctaRegisterBtn.style.display = isLoggedIn ? "none" : "inline-block";
        if (ctaDashboardBtn) ctaDashboardBtn.style.display = isLoggedIn ? "inline-block" : "none";
    }
    function adminDashboardHref() {
        const path = window.location.pathname.replace(/\\/g, "/");
        if (path.includes("/pages/admin/") || path.includes("/pages/student/") || path.includes("/pages/teacher/")) {
            return "../admin/dashboard.html";
        }
        if (path.includes("/pages/")) {
            return "admin/dashboard.html";
        }
        return "pages/admin/dashboard.html";
    }
    function syncAdminLogo() {
        if (!currentIsAdmin) return;
        document.querySelectorAll(".logo").forEach(l => l.setAttribute("href", adminDashboardHref()));
    }
    updateActiveNav();

    
    let isNavigating = false;

    function contentNodes() {
        return Array.from(document.body.children).filter(el => !el.classList.contains("navbar") && !el.classList.contains("site-footer"));
    }

    function fadeOutContent() {
        contentNodes().forEach(el => {
            if (el.tagName === "SCRIPT") return;
            el.style.transition = "opacity 0.15s ease";
            el.style.opacity = "0";
        });
    }

    async function navigateTo(url, { push = true } = {}) {
        if (isNavigating) return;
        isNavigating = true;
        try {
            fadeOutContent();
            await new Promise(r => setTimeout(r, 160));

            const res = await fetch(url, { credentials: "same-origin" });
            if (!res.ok) throw new Error("fetch failed: " + res.status);
            const html = await res.text();
            const doc = new DOMParser().parseFromString(html, "text/html");
            document.title = doc.title;

            
            const oldLinks = document.querySelectorAll("#navLinks a");
            const newLinks = doc.querySelectorAll("#navLinks a");
            oldLinks.forEach((a, i) => {
                if (newLinks[i]) a.setAttribute("href", newLinks[i].getAttribute("href"));
            });
            const oldLogo = document.querySelector(".logo");
            const newLogo = doc.querySelector(".logo");
            if (oldLogo && newLogo) oldLogo.setAttribute("href", newLogo.getAttribute("href"));

            
            document.head.querySelectorAll("style, script").forEach(el => el.remove());
            doc.head.querySelectorAll("style, script").forEach(el => {
                if (el.tagName === "SCRIPT") {
                    const fresh = document.createElement("script");
                    Array.from(el.attributes).forEach(attr => fresh.setAttribute(attr.name, attr.value));
                    if (el.textContent) fresh.textContent = el.textContent;
                    document.head.appendChild(fresh);
                } else {
                    document.head.appendChild(document.importNode(el, true));
                }
            });

            contentNodes().forEach(el => el.remove());

            const anchorEl = document.querySelector(".navbar");
            let insertAfter = anchorEl;
            const nodes = [];
            Array.from(doc.body.children).forEach(el => {
                if (el.classList.contains("navbar") || el.classList.contains("site-footer")) return;
                nodes.push(el);
            });
            nodes.forEach(el => {
                insertAfter.after(el);
                insertAfter = el;
            });

            
            nodes.forEach(el => {
                const scripts = [];
                if (el.tagName === "SCRIPT") scripts.push(el);
                el.querySelectorAll?.("script").forEach(s => scripts.push(s));
                scripts.forEach(old => {
                    const fresh = document.createElement("script");
                    Array.from(old.attributes).forEach(attr => fresh.setAttribute(attr.name, attr.value));
                    if (old.textContent) fresh.textContent = old.textContent;
                    old.replaceWith(fresh);
                });
            });

            
            
            if (document.readyState === "complete") {
                setTimeout(() => window.dispatchEvent(new Event("load")), 0);
            }

            if (push) history.pushState({}, "", url);
            window.scrollTo(0, 0);
            updateActiveNav();
            syncAdminLogo();
            syncHeroButtons();

            
            contentNodes().forEach(el => {
                if (el.tagName === "SCRIPT") return;
                el.style.opacity = "0";
                el.style.transition = "opacity 0.2s ease";
            });
            requestAnimationFrame(() => requestAnimationFrame(() => {
                contentNodes().forEach(el => {
                    if (el.tagName === "SCRIPT") return;
                    el.style.opacity = "1";
                });
            }));
        } catch (err) {
            
            window.location.href = url;
        } finally {
            isNavigating = false;
        }
    }

    window.addEventListener("popstate", () => navigateTo(window.location.href, { push: false }));

    document.addEventListener("click", (e) => {
        const a = e.target.closest("a[href]");
        if (!a) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        if (a.target === "_blank") return;
        const href = a.getAttribute("href");
        if (!href || href.startsWith("#") || /^(https?:|javascript:|mailto:|tel:)/i.test(href)) return;
        if (!href.includes(".html")) return;
        e.preventDefault();
        navigateTo(new URL(href, window.location.href).href);
    });
});
