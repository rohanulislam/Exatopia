

export class CheatDetector {
    constructor(options = {}) {
        this.onViolation = options.onViolation || function() {};
        this.maxViolations = options.maxViolations || 3;
        this.violationCount = 0;
        this.isMonitoring = false;
        
        
        this.lastViolationTime = 0;
        this.lastViolationType = null;
        this.cooldownMs = 500; 

        
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handleBlur = this.handleBlur.bind(this);
        this.handleFullscreenChange = this.handleFullscreenChange.bind(this);
        this.handleContextMenu = this.handleContextMenu.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleCopyPaste = this.handleCopyPaste.bind(this);
        this.handleDragDrop = this.handleDragDrop.bind(this);
        this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    }

    start() {
        if (this.isMonitoring) return;
        this.isMonitoring = true;

        if (typeof document !== "undefined") {
            document.addEventListener("visibilitychange", this.handleVisibilityChange);
            document.addEventListener("fullscreenchange", this.handleFullscreenChange);
            document.addEventListener("webkitfullscreenchange", this.handleFullscreenChange);
            document.addEventListener("contextmenu", this.handleContextMenu);
            document.addEventListener("keydown", this.handleKeyDown);
            document.addEventListener("copy", this.handleCopyPaste);
            document.addEventListener("cut", this.handleCopyPaste);
            document.addEventListener("paste", this.handleCopyPaste);
            document.addEventListener("dragstart", this.handleDragDrop);
        }

        if (typeof window !== "undefined") {
            window.addEventListener("blur", this.handleBlur);
            window.addEventListener("beforeunload", this.handleBeforeUnload);
        }
    }

    stop() {
        if (!this.isMonitoring) return;
        this.isMonitoring = false;

        if (typeof document !== "undefined") {
            document.removeEventListener("visibilitychange", this.handleVisibilityChange);
            document.removeEventListener("fullscreenchange", this.handleFullscreenChange);
            document.removeEventListener("webkitfullscreenchange", this.handleFullscreenChange);
            document.removeEventListener("contextmenu", this.handleContextMenu);
            document.removeEventListener("keydown", this.handleKeyDown);
            document.removeEventListener("copy", this.handleCopyPaste);
            document.removeEventListener("cut", this.handleCopyPaste);
            document.removeEventListener("paste", this.handleCopyPaste);
            document.removeEventListener("dragstart", this.handleDragDrop);
        }

        if (typeof window !== "undefined") {
            window.removeEventListener("blur", this.handleBlur);
            window.removeEventListener("beforeunload", this.handleBeforeUnload);
        }
    }

    triggerViolation(type, description) {
        if (!this.isMonitoring) return;

        
        
        const now = Date.now();
        const timeSinceLast = now - this.lastViolationTime;

        if (timeSinceLast < this.cooldownMs) {
            const isDuplicatePair =
                (type === this.lastViolationType) ||
                (type === "WINDOW_BLUR" && this.lastViolationType === "TAB_SWITCH") ||
                (type === "TAB_SWITCH" && this.lastViolationType === "WINDOW_BLUR") ||
                (type === "WINDOW_BLUR" && this.lastViolationType === "FULLSCREEN_EXIT");

            if (isDuplicatePair) {
                return; 
            }
        }

        this.lastViolationTime = now;
        this.lastViolationType = type;
        this.violationCount++;

        const violationData = {
            type: type,
            description: description,
            count: this.violationCount,
            max: this.maxViolations,
            timestamp: new Date().toISOString()
        };

        
        
        this.onViolation(violationData);
    }

    handleVisibilityChange() {
        if (document.hidden) {
            this.triggerViolation("TAB_SWITCH", "User switched tab or minimized browser window.");
        }
    }

    handleBlur() {
        this.triggerViolation("WINDOW_BLUR", "Browser window lost focus.");
    }

    handleFullscreenChange() {
        const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (!isFullscreen) {
            this.triggerViolation("FULLSCREEN_EXIT", "User exited full-screen mode.");
        }
    }

    handleContextMenu(e) {
        e.preventDefault();
        this.triggerViolation("RIGHT_CLICK", "Right-click context menu was blocked.");
    }

    handleKeyDown(e) {
        const isModifier = e.ctrlKey || e.metaKey; 
        const key = e.key ? e.key.toUpperCase() : "";

        
        if (e.key === "F12" || key === "PRINTSCREEN" || e.keyCode === 44) {
            e.preventDefault();
            this.triggerViolation("FORBIDDEN_KEY", `Blocked key: ${e.key || 'PrintScreen'}`);
            return;
        }

        
        if (isModifier && e.shiftKey && (key === "I" || key === "J" || key === "C")) {
            e.preventDefault();
            this.triggerViolation("DEVTOOLS_SHORTCUT", "Blocked DevTools shortcut combination.");
            return;
        }

        
        if (isModifier && key === "U") {
            e.preventDefault();
            this.triggerViolation("VIEW_SOURCE_SHORTCUT", "Blocked View Source shortcut.");
            return;
        }

        
        if (isModifier && key === "P") {
            e.preventDefault();
            this.triggerViolation("PRINT_SHORTCUT", "Blocked Print shortcut.");
            return;
        }

        
        if (isModifier && key === "S") {
            e.preventDefault();
            this.triggerViolation("SAVE_PAGE_SHORTCUT", "Blocked Save Page shortcut.");
            return;
        }

        
        if (isModifier && (key === "C" || key === "V" || key === "X")) {
            e.preventDefault();
            this.triggerViolation("CLIPBOARD_SHORTCUT", `Blocked shortcut: ${isModifier ? 'Ctrl/Cmd' : ''}+${e.key}`);
            return;
        }
    }

    handleCopyPaste(e) {
        e.preventDefault();
        this.triggerViolation("CLIPBOARD_ACTION", "Copy, cut, or paste attempt was blocked.");
    }

    handleDragDrop(e) {
        e.preventDefault();
    }

    handleBeforeUnload(e) {
        e.preventDefault();
        e.returnValue = "An exam is currently in progress. Leaving will submit your test.";
        return e.returnValue;
    }

    static async requestFullscreen() {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
            await elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
            await elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
            await elem.msRequestFullscreen();
        }
    }

    static isFullscreen() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }
}