import { db, auth } from "./firebase-config.js";
import { getGrade } from "./ui-utils.js";
import {
    collection,
    addDoc,
    doc,
    setDoc,
    getDoc,
    getDocs,
    query,
    where,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


export function generateExamCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "EX-";
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}


function getLocalMocks(uid) {
    try {
        const key = uid ? `examshield_mocks_${uid}` : "examshield_mocks_guest";
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function saveLocalMock(uid, mockRecord) {
    try {
        const key = uid ? `examshield_mocks_${uid}` : "examshield_mocks_guest";
        const list = getLocalMocks(uid);
        const idx = list.findIndex(m => m.id === mockRecord.id);
        if (idx >= 0) {
            list[idx] = mockRecord;
        } else {
            list.unshift(mockRecord);
        }
        localStorage.setItem(key, JSON.stringify(list));
    } catch (e) {
        console.warn("Could not save practice exam to local storage:", e);
    }
}


export async function createExam(examData, questions) {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated.");

    const code = generateExamCode();

    
    const sanitizedQuestions = questions.map((q, idx) => ({
        id: idx + 1,
        text: q.text || "",
        type: q.type || "mcq",
        options: q.options || [],
        marks: parseInt(q.marks || 1)
    }));

    
    const examRef = await addDoc(collection(db, "exams"), {
        title: examData.title,
        teacherId: user.uid,
        teacherEmail: user.email || "",
        code: code,
        duration: parseInt(examData.duration), 
        startTime: examData.startTime,
        endTime: examData.endTime,
        maxViolations: parseInt(examData.maxViolations),
        isMock: false,
        status: "published",
        questionCount: sanitizedQuestions.length,
        questions: sanitizedQuestions,
        createdAt: serverTimestamp()
    });

    const examId = examRef.id;

    
    try {
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];

            
            const qRef = await addDoc(collection(db, `exams/${examId}/questions`), {
                text: q.text,
                type: q.type || "mcq",
                options: q.options || [],
                correctAnswer: q.correctAnswer || "",
                marks: parseInt(q.marks || 1)
            });

            
            try {
                await setDoc(doc(db, "answerKeys", examId), {
                    [qRef.id]: q.correctAnswer
                }, { merge: true });
            } catch (keyErr) {
                console.warn("answerKeys write skipped (permissions):", keyErr.message);
            }
        }
    } catch (subErr) {
        console.warn("Questions subcollection write skipped (permissions):", subErr.message);
    }

    return { examId, code };
}


export async function saveMockExam(mockData, questions) {
    const user = auth.currentUser;
    const uid = user ? user.uid : "guest";

    const sanitizedQuestions = questions.map((q, idx) => ({
        id: q.id || (idx + 1),
        text: q.text || "",
        options: q.options || [],
        correctAnswer: q.correctAnswer || "",
        explanation: q.explanation || ""
    }));

    const mockId = `mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const mockRecord = {
        id: mockId,
        studentId: uid,
        studentEmail: user?.email || "",
        title: mockData.title || `Practice Exam (${sanitizedQuestions.length} Questions)`,
        timeLimit: parseInt(mockData.timeLimit || 10),
        numQuestions: sanitizedQuestions.length,
        isMock: true,
        questions: sanitizedQuestions,
        createdAt: new Date().toISOString()
    };

    
    saveLocalMock(uid, mockRecord);

    
    if (user) {
        try {
            const examRef = await addDoc(collection(db, "exams"), {
                title: mockRecord.title,
                studentId: user.uid,
                teacherId: user.uid,
                teacherEmail: user.email || "",
                duration: mockRecord.timeLimit,
                isMock: true,
                status: "practice",
                questionCount: sanitizedQuestions.length,
                questions: sanitizedQuestions,
                createdAt: serverTimestamp()
            });
            mockRecord.firestoreId = examRef.id;
            saveLocalMock(uid, mockRecord);
        } catch (dbErr) {
            console.warn("Firestore sync skipped (using reliable local store):", dbErr.message);
        }
    }

    return mockId;
}


export async function getMockExam(mockId) {
    const user = auth.currentUser;
    const uid = user ? user.uid : "guest";

    
    const userMocks = getLocalMocks(uid);
    const found = userMocks.find(m => m.id === mockId || m.firestoreId === mockId);
    if (found) return found;

    
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith("examshield_mocks_")) {
                const list = JSON.parse(localStorage.getItem(key) || "[]");
                const m = list.find(item => item.id === mockId || item.firestoreId === mockId);
                if (m) return m;
            }
        }
    } catch (e) {}

    
    try {
        const examDoc = await getDoc(doc(db, "exams", mockId));
        if (examDoc.exists()) {
            return { id: examDoc.id, ...examDoc.data() };
        }
    } catch (e) {
        console.warn("Firestore fetch practice exam skipped:", e.message);
    }

    return null;
}


export async function saveMockResult(mockId, resultData) {
    const user = auth.currentUser;
    const uid = user ? user.uid : "guest";

    const resultRecord = {
        mockId: mockId || null,
        studentId: uid,
        studentEmail: user?.email || "",
        score: resultData.score,
        total: resultData.total,
        percentage: Math.round((resultData.score / (resultData.total || 1)) * 100),
        answers: resultData.answers || {},
        completedAt: new Date().toISOString()
    };

    
    try {
        const key = `examshield_mock_results_${uid}`;
        const existing = JSON.parse(localStorage.getItem(key) || "[]");
        existing.unshift(resultRecord);
        localStorage.setItem(key, JSON.stringify(existing));
    } catch (e) {}

    
    if (user) {
        try {
            await addDoc(collection(db, "attempts"), {
                ...resultRecord,
                isMock: true,
                status: "practice_completed",
                completedAt: serverTimestamp()
            });
        } catch (e) {
            console.warn("Could not sync practice result to Firestore attempts:", e.message);
        }
    }

    return resultRecord;
}


export async function saveVivaResult(vivaData) {
    const user = auth.currentUser;
    const uid = user ? user.uid : "guest";

    const score = parseInt(vivaData.score ?? 0);
    const total = parseInt(vivaData.total ?? (vivaData.questions ? vivaData.questions.length * 10 : 30));

    const record = {
        id: `viva_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        studentId: uid,
        studentEmail: user?.email || "",
        title: vivaData.title || "AI Viva",
        score,
        total,
        percentage: total > 0 ? Math.round((score / total) * 100) : 0,
        questions: vivaData.questions || [],
        answers: vivaData.answers || [],
        feedbacks: vivaData.feedbacks || [],
        scores: vivaData.scores || [],
        messages: vivaData.messages || [],
        completedAt: new Date().toISOString()
    };

    
    try {
        const key = `examshield_vivas_${uid}`;
        const existing = JSON.parse(localStorage.getItem(key) || "[]");
        existing.unshift(record);
        localStorage.setItem(key, JSON.stringify(existing));
    } catch (e) {}

    
    if (user) {
        try {
            const ref = await addDoc(collection(db, "vivas"), {
                ...record,
                completedAt: serverTimestamp()
            });
            try {
                const key = `examshield_vivas_${uid}`;
                const list = JSON.parse(localStorage.getItem(key) || "[]");
                const idx = list.findIndex(v => v.id === record.id);
                if (idx >= 0) {
                    list[idx].firestoreId = ref.id;
                    localStorage.setItem(key, JSON.stringify(list));
                }
            } catch (e) {}
        } catch (e) {
            console.warn("Could not sync viva result to Firestore:", e.message);
        }
    }

    return record;
}


export async function getStudentVivaHistory() {
    const user = auth.currentUser;
    const uid = user ? user.uid : "guest";

    let local = [];
    try {
        local = JSON.parse(localStorage.getItem(`examshield_vivas_${uid}`) || "[]");
    } catch (e) { local = []; }

    if (user) {
        try {
            const q = query(collection(db, "vivas"), where("studentId", "==", user.uid));
            const snap = await getDocs(q);
            const merged = [...local];
            snap.forEach(docSnap => {
                const data = docSnap.data();
                const exists = merged.some(v =>
                    v.firestoreId === docSnap.id || v.id === docSnap.id ||
                    (parseInt(v.score) === parseInt(data.score) && parseInt(v.total) === parseInt(data.total) &&
                     v.completedAt && data.completedAt &&
                     Math.abs(
                         (v.completedAt.toDate ? v.completedAt.toDate().getTime() : new Date(v.completedAt).getTime()) -
                         (data.completedAt.toDate ? data.completedAt.toDate().getTime() : new Date(data.completedAt).getTime())
                     ) < 120000)
                );
                if (!exists) merged.push({ id: docSnap.id, ...data });
            });
            local = merged;
        } catch (e) {
            console.warn("Remote vivas query skipped (using local storage):", e.message);
        }
    }

    local.sort((a, b) => {
        const t = (x) => x.completedAt
            ? (x.completedAt.toDate ? x.completedAt.toDate().getTime() : new Date(x.completedAt).getTime())
            : 0;
        return t(b) - t(a);
    });

    return local;
}


export async function getExamQuestions(examId) {
    let questions = [];
    let examEndTime = null;
    let embeddedQuestions = null;

    try {
        const examDoc = await getDoc(doc(db, "exams", examId));
        if (examDoc.exists()) {
            const data = examDoc.data();
            examEndTime = data.endTime ? new Date(data.endTime).getTime() : null;
            if (Array.isArray(data.questions) && data.questions.length > 0) {
                embeddedQuestions = data.questions;
            }
        }
    } catch (e) {}

    try {
        const subSnapshot = await getDocs(collection(db, `exams/${examId}/questions`));
        subSnapshot.forEach(qDoc => {
            questions.push({ id: qDoc.id, ...qDoc.data() });
        });
    } catch (e) {}

    if (questions.length === 0 && embeddedQuestions) {
        questions = embeddedQuestions;
    }

    
    const ended = examEndTime === null || Date.now() >= examEndTime;
    if (!ended) {
        questions = questions.map(q => {
            const copy = { ...q };
            delete copy.correctAnswer;
            return copy;
        });
    }

    return questions;
}


export async function deleteHistoryRecord(recordId) {
    const user = auth.currentUser;
    const uid = user ? user.uid : "guest";

    
    try {
        await deleteDoc(doc(db, "attempts", recordId));
    } catch (e) {}

    
    try {
        const key = `examshield_mock_results_${uid}`;
        const list = JSON.parse(localStorage.getItem(key) || "[]");
        const filtered = list.filter(r => (r.mockId || r.examId) !== recordId && r.id !== recordId);
        localStorage.setItem(key, JSON.stringify(filtered));
    } catch (e) {}

    
    try {
        const key = `examshield_vivas_${uid}`;
        const list = JSON.parse(localStorage.getItem(key) || "[]");
        const filtered = list.filter(v => v.id !== recordId && v.firestoreId !== recordId);
        localStorage.setItem(key, JSON.stringify(filtered));
    } catch (e) {}

    
    try {
        await deleteDoc(doc(db, "vivas", recordId));
    } catch (e) {}

    return true;
}


export async function getExamById(examId) {
    const examDoc = await getDoc(doc(db, "exams", examId));
    if (!examDoc.exists()) return null;

    const data = examDoc.data();
    let questions = [];

    
    try {
        const subSnapshot = await getDocs(collection(db, `exams/${examId}/questions`));
        subSnapshot.forEach(qDoc => {
            questions.push({ id: qDoc.id, ...qDoc.data() });
        });
    } catch (e) {
        console.warn("Subcollection read error:", e);
    }

    if (questions.length === 0 && Array.isArray(data.questions)) {
        questions = data.questions;
    }

    return { id: examDoc.id, ...data, questions };
}


export async function updateExam(examId, examData, questions) {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated.");

    const sanitizedQuestions = questions.map((q, idx) => ({
        id: idx + 1,
        text: q.text || "",
        type: q.type || "mcq",
        options: q.options || [],
        marks: parseInt(q.marks || 1)
    }));

    await updateDoc(doc(db, "exams", examId), {
        title: examData.title,
        duration: parseInt(examData.duration),
        startTime: examData.startTime,
        endTime: examData.endTime,
        maxViolations: parseInt(examData.maxViolations),
        questionCount: sanitizedQuestions.length,
        questions: sanitizedQuestions
    });

    
    try {
        const subSnapshot = await getDocs(collection(db, `exams/${examId}/questions`));
        for (const qDoc of subSnapshot.docs) {
            await deleteDoc(doc(db, `exams/${examId}/questions`, qDoc.id));
        }

        try { await deleteDoc(doc(db, "answerKeys", examId)); } catch (e) {}

        for (const q of questions) {
            const qRef = await addDoc(collection(db, `exams/${examId}/questions`), {
                text: q.text,
                type: q.type || "mcq",
                options: q.options || [],
                correctAnswer: q.correctAnswer || "",
                marks: parseInt(q.marks || 1)
            });
            try {
                await setDoc(doc(db, "answerKeys", examId), {
                    [qRef.id]: q.correctAnswer
                }, { merge: true });
            } catch (e) {}
        }
    } catch (e) {
        console.warn("Could not replace questions subcollection:", e.message);
    }

    return true;
}


export async function deleteExam(examId) {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated.");

    
    try {
        const subSnapshot = await getDocs(collection(db, `exams/${examId}/questions`));
        for (const qDoc of subSnapshot.docs) {
            await deleteDoc(doc(db, `exams/${examId}/questions`, qDoc.id));
        }
    } catch (e) {
        console.warn("Could not delete questions subcollection:", e.message);
    }

    
    try {
        await deleteDoc(doc(db, "answerKeys", examId));
    } catch (e) {}

    
    await deleteDoc(doc(db, "exams", examId));
    return true;
}


export async function expelStudentAttempt(attemptId) {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated.");

    try {
        const vSnap = await getDocs(collection(db, `attempts/${attemptId}/violations`));
        for (const vDoc of vSnap.docs) {
            await deleteDoc(doc(db, `attempts/${attemptId}/violations`, vDoc.id));
        }
    } catch (e) {
        console.warn("Could not delete violation logs:", e.message);
    }

    await deleteDoc(doc(db, "attempts", attemptId));
    return true;
}


export async function getTeacherExams() {
    const user = auth.currentUser;
    if (!user) return [];

    try {
        const q = query(collection(db, "exams"), where("teacherId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        
        const exams = [];
        for (const docSnap of querySnapshot.docs) {
            const data = docSnap.data();
            
            if (data.isMock) continue;

            let questions = data.questions || [];
            if (!questions.length) {
                try {
                    const subSnapshot = await getDocs(collection(db, `exams/${docSnap.id}/questions`));
                    subSnapshot.forEach(qDoc => {
                        questions.push({ id: qDoc.id, ...qDoc.data() });
                    });
                } catch (err) {
                    console.warn("Subcollection read error:", err);
                }
            }
            exams.push({ 
                id: docSnap.id, 
                ...data, 
                questions, 
                questionCount: data.questionCount || questions.length 
            });
        }
        return exams;
    } catch (err) {
        console.warn("Error fetching teacher exams:", err);
        return [];
    }
}


export function getExamScheduleStatus(exam = {}) {
    const now = Date.now();
    const start = exam.startTime ? new Date(exam.startTime).getTime() : NaN;
    const end = exam.endTime ? new Date(exam.endTime).getTime() : NaN;
    if (isNaN(start) || isNaN(end)) return "Scheduled";
    if (now < start) return "Yet to start";
    if (now > end) return "Ended";
    return "Running";
}


export async function getMyCreatedExamsWithStats() {
    const user = auth.currentUser;
    if (!user) return [];

    try {
        const q = query(collection(db, "exams"), where("teacherId", "==", user.uid));
        const snap = await getDocs(q);
        const exams = [];

        for (const docSnap of snap.docs) {
            const data = docSnap.data();
            if (data.isMock) continue; 

            let submissions = 0;
            let scoreSum = 0;
            try {
                const aq = query(collection(db, "attempts"), where("examId", "==", docSnap.id));
                const aSnap = await getDocs(aq);
                aSnap.forEach(aSnapDoc => {
                    const ad = aSnapDoc.data();
                    const score = parseInt(ad.score ?? 0);
                    const total = parseInt(ad.total ?? 0);
                    const pct = total > 0 ? Math.round((score / total) * 100) : (ad.percentage || 0);
                    if (!isNaN(pct)) { scoreSum += pct; submissions++; }
                });
            } catch (e) {
                console.warn("Could not load attempts for exam:", docSnap.id, e.message);
            }

            exams.push({
                id: docSnap.id,
                title: data.title || "Exam",
                code: data.code || "—",
                startTime: data.startTime,
                endTime: data.endTime,
                questionCount: data.questionCount || (data.questions || []).length,
                submissions,
                avgScore: submissions > 0 ? Math.round(scoreSum / submissions) : null,
                createdAt: data.createdAt
            });
        }
        return exams;
    } catch (err) {
        console.warn("Error fetching created exams:", err);
        return [];
    }
}


export async function getStudentMockExams() {
    const user = auth.currentUser;
    const uid = user ? user.uid : "guest";

    
    const localMocks = getLocalMocks(uid);

    
    if (user) {
        try {
            const q = query(
                collection(db, "exams"), 
                where("isMock", "==", true), 
                where("studentId", "==", user.uid)
            );
            const querySnapshot = await getDocs(q);
            const remoteMocks = [];
            querySnapshot.forEach((docSnap) => {
                remoteMocks.push({ id: docSnap.id, ...docSnap.data() });
            });

            
            const merged = [...localMocks];
            for (const rem of remoteMocks) {
                if (!merged.some(m => m.id === rem.id || m.firestoreId === rem.id)) {
                    merged.push(rem);
                }
            }
            return merged;
        } catch (err) {
            
            console.warn("Remote practice exams query skipped (using local storage):", err.message);
            return localMocks;
        }
    }

    return localMocks;
}


export async function getStudentExamHistory() {
    const user = auth.currentUser;
    if (!user) return [];

    const attempts = [];
    const examMap = {};

    
    try {
        const qExams = query(collection(db, "exams"));
        const examSnap = await getDocs(qExams);
        examSnap.forEach(d => {
            const data = d.data();
            examMap[d.id] = { title: data.title || "Teacher Exam", maxViolations: parseInt(data.maxViolations) || 0 };
        });
    } catch (e) {
        console.warn("Exam map pre-fetch warning:", e.message);
    }

    
    try {
        const q = query(collection(db, "attempts"), where("studentId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach(docSnap => {
            const data = docSnap.data();
            
            if (!data.submittedAt && !data.completedAt && (data.total === undefined || data.total === 0)) {
                return;
            }

            const score = parseInt(data.score ?? 0);
            const total = parseInt(data.total ?? 0);
            const percentage = total > 0 ? Math.round((score / total) * 100) : (data.percentage || 0);
            const gradeInfo = getGrade(percentage);

            
            let resolvedTitle = data.examTitle;
            const mapped = data.examId ? examMap[data.examId] : null;
            if (!resolvedTitle || resolvedTitle === "Formal Exam" || resolvedTitle === "Exam") {
                if (mapped) {
                    resolvedTitle = mapped.title;
                } else {
                    resolvedTitle = data.isMock ? "Practice Exam" : "Teacher Exam";
                }
            }

            attempts.push({
                id: docSnap.id,
                mockId: data.mockId || null,
                examId: data.examId || data.mockId || "N/A",
                examTitle: resolvedTitle,
                isMock: !!data.isMock,
                score: score,
                total: total,
                percentage: percentage,
                grade: gradeInfo.grade,
                gradeLabel: gradeInfo.label,
                gradeColor: gradeInfo.color,
                gradeBg: gradeInfo.bg,
                autoSubmitted: !!data.autoSubmitted,
                violationCount: data.violationCount || 0,
                maxViolations: data.maxViolations || (mapped ? mapped.maxViolations : 0),
                submittedAt: data.submittedAt || data.completedAt || data.startedAt
            });
        });
    } catch (err) {
        console.warn("Could not query Firestore attempts for history:", err.message);
    }

    
    try {
        const key = `examshield_mock_results_${user.uid}`;
        const localList = JSON.parse(localStorage.getItem(key) || "[]");
        localList.forEach((r, idx) => {
            const score = parseInt(r.score ?? 0);
            const total = parseInt(r.total ?? 0);
            const percentage = total > 0 ? Math.round((score / total) * 100) : (r.percentage || 0);
            const gradeInfo = getGrade(percentage);
            const mockKey = r.mockId || r.examId;

            
            const alreadyExists = attempts.some(a => 
                (mockKey && (a.id === mockKey || a.mockId === mockKey || a.examId === mockKey)) ||
                (a.isMock && a.score === score && a.total === total)
            );

            if (!alreadyExists) {
                attempts.push({
                    id: mockKey || `mock_hist_${idx}`,
                    mockId: mockKey || null,
                    examId: mockKey || "practice",
                    examTitle: r.examTitle || r.title || "Practice Exam",
                    isMock: true,
                    score: score,
                    total: total,
                    percentage: percentage,
                    grade: gradeInfo.grade,
                    gradeLabel: gradeInfo.label,
                    gradeColor: gradeInfo.color,
                    gradeBg: gradeInfo.bg,
                    autoSubmitted: false,
                    violationCount: 0,
                    submittedAt: r.completedAt || r.submittedAt
                });
            }
        });
    } catch (e) {}

    
    try {
        const vivas = await getStudentVivaHistory();
        vivas.forEach((v, idx) => {
            const score = parseInt(v.score ?? 0);
            const total = parseInt(v.total ?? 0);
            const percentage = total > 0 ? Math.round((score / total) * 100) : (v.percentage || 0);
            const gradeInfo = getGrade(percentage);

            attempts.push({
                id: v.id || `viva_hist_${idx}`,
                mockId: null,
                examId: v.id || "viva",
                examTitle: v.title || "AI Viva",
                isMock: false,
                isViva: true,
                score: score,
                total: total,
                percentage: percentage,
                grade: gradeInfo.grade,
                gradeLabel: gradeInfo.label,
                gradeColor: gradeInfo.color,
                gradeBg: gradeInfo.bg,
                autoSubmitted: false,
                violationCount: 0,
                submittedAt: v.completedAt,
                messages: v.messages || [],
                questions: v.questions || []
            });
        });
    } catch (e) {}

    
    attempts.sort((a, b) => {
        const parseTime = (t) => {
            if (!t) return 0;
            if (t.toDate) return t.toDate().getTime();
            return new Date(t).getTime() || 0;
        };
        return parseTime(b.submittedAt) - parseTime(a.submittedAt);
    });

    
    const uniqueAttempts = [];
    attempts.forEach(item => {
        const isDuplicate = uniqueAttempts.some(existing => {
            if (item.mockId && existing.mockId && item.mockId === existing.mockId) {
                return true;
            }
            if (item.isMock && existing.isMock && item.score === existing.score && item.total === existing.total) {
                const timeA = item.submittedAt ? (item.submittedAt.toDate ? item.submittedAt.toDate().getTime() : new Date(item.submittedAt).getTime()) : 0;
                const timeB = existing.submittedAt ? (existing.submittedAt.toDate ? existing.submittedAt.toDate().getTime() : new Date(existing.submittedAt).getTime()) : 0;
                if (Math.abs(timeA - timeB) < 120000) { 
                    return true;
                }
            }
            return false;
        });
        if (!isDuplicate) {
            uniqueAttempts.push(item);
        }
    });

    return uniqueAttempts;
}


export async function getStudentProfileStats() {
    const history = await getStudentExamHistory();
    const counts = { A: 0, B: 0, C: 0, D: 0, E: 0, Fail: 0 };
    let scoreSum = 0;

    history.forEach(att => {
        if (counts[att.grade] !== undefined) {
            counts[att.grade]++;
        } else {
            counts.Fail++;
        }
        scoreSum += att.percentage;
    });

    const total = history.length;
    const avgPercentage = total > 0 ? Math.round(scoreSum / total) : 0;
    const avgGrade = total > 0
        ? getGrade(avgPercentage)
        : { grade: "—", label: "—", color: "#c8854a", bg: "#1a0f08" };

    const gradeDistribution = [
        { grade: "A", label: "Grade A (90%+)", count: counts.A, percentage: total > 0 ? Math.round((counts.A / total) * 100) : 0, color: "#10b981" },
        { grade: "B", label: "Grade B (80-89%)", count: counts.B, percentage: total > 0 ? Math.round((counts.B / total) * 100) : 0, color: "#3b82f6" },
        { grade: "C", label: "Grade C (70-79%)", count: counts.C, percentage: total > 0 ? Math.round((counts.C / total) * 100) : 0, color: "#6366f1" },
        { grade: "D", label: "Grade D (60-69%)", count: counts.D, percentage: total > 0 ? Math.round((counts.D / total) * 100) : 0, color: "#f59e0b" },
        { grade: "E", label: "Grade E (40-59%)", count: counts.E, percentage: total > 0 ? Math.round((counts.E / total) * 100) : 0, color: "#ec4899" },
        { grade: "Fail", label: "Fail (<40%)", count: counts.Fail, percentage: total > 0 ? Math.round((counts.Fail / total) * 100) : 0, color: "#ef4444" }
    ];

    return {
        totalExamsTaken: total,
        avgPercentage,
        avgGrade,
        gradeDistribution,
        history
    };
}


export async function getTeacherProfileStats() {
    const user = auth.currentUser;
    if (!user) {
        return {
            totalExams: 0,
            totalSubmissions: 0,
            avgPercentage: 0,
            avgGrade: { grade: "—", label: "—", color: "#c8854a", bg: "#1a0f08" },
            gradeDistribution: []
        };
    }

    const exams = await getTeacherExams();
    const examIds = exams.map(e => e.id);

    const allAttempts = [];
    for (const examId of examIds) {
        try {
            const q = query(collection(db, "attempts"), where("examId", "==", examId));
            const snap = await getDocs(q);
            snap.forEach(docSnap => {
                const data = docSnap.data();
                const score = parseInt(data.score ?? 0);
                const total = parseInt(data.total ?? 0);
                const percentage = total > 0 ? Math.round((score / total) * 100) : (data.percentage || 0);
                const g = getGrade(percentage).grade;
                allAttempts.push({
                    id: docSnap.id,
                    examId: examId,
                    studentId: data.studentId,
                    score,
                    total,
                    percentage,
                    grade: g
                });
            });
        } catch (e) {
            console.warn("Could not query attempts for exam:", examId, e);
        }
    }

    const counts = { A: 0, B: 0, C: 0, D: 0, E: 0, Fail: 0 };
    let scoreSum = 0;

    allAttempts.forEach(att => {
        if (counts[att.grade] !== undefined) {
            counts[att.grade]++;
        } else {
            counts.Fail++;
        }
        scoreSum += att.percentage;
    });

    const totalSubmissions = allAttempts.length;
    const avgPercentage = totalSubmissions > 0 ? Math.round(scoreSum / totalSubmissions) : 0;
    const avgGrade = totalSubmissions > 0
        ? getGrade(avgPercentage)
        : { grade: "—", label: "—", color: "#c8854a", bg: "#1a0f08" };

    const gradeDistribution = [
        { grade: "A", label: "Grade A (90%+)", count: counts.A, percentage: totalSubmissions > 0 ? Math.round((counts.A / totalSubmissions) * 100) : 0, color: "#10b981" },
        { grade: "B", label: "Grade B (80-89%)", count: counts.B, percentage: totalSubmissions > 0 ? Math.round((counts.B / totalSubmissions) * 100) : 0, color: "#3b82f6" },
        { grade: "C", label: "Grade C (70-79%)", count: counts.C, percentage: totalSubmissions > 0 ? Math.round((counts.C / totalSubmissions) * 100) : 0, color: "#6366f1" },
        { grade: "D", label: "Grade D (60-69%)", count: counts.D, percentage: totalSubmissions > 0 ? Math.round((counts.D / totalSubmissions) * 100) : 0, color: "#f59e0b" },
        { grade: "E", label: "Grade E (40-59%)", count: counts.E, percentage: totalSubmissions > 0 ? Math.round((counts.E / totalSubmissions) * 100) : 0, color: "#ec4899" },
        { grade: "Fail", label: "Fail (<40%)", count: counts.Fail, percentage: totalSubmissions > 0 ? Math.round((counts.Fail / totalSubmissions) * 100) : 0, color: "#ef4444" }
    ];

    return {
        totalExams: exams.length,
        totalSubmissions,
        avgPercentage,
        avgGrade,
        gradeDistribution
    };
}
export async function getExamSubmissions(examId) {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated.");

    try {
        const q = query(collection(db, "attempts"), where("examId", "==", examId));
        const snap = await getDocs(q);

        // Resolve student names once per unique studentId (users collection stores the display name)
        const studentIds = [...new Set(snap.docs.map((d) => d.data().studentId).filter(Boolean))];
        const nameCache = {};
        await Promise.all(studentIds.map(async (sid) => {
            try {
                const uSnap = await getDoc(doc(db, "users", sid));
                nameCache[sid] = uSnap.exists() ? (uSnap.data().name || "") : "";
            } catch (e) {
                nameCache[sid] = "";
            }
        }));

        const submissions = [];
        snap.docs.forEach((docSnap) => {
            const data = docSnap.data();
            if (!data.submittedAt) return; // exam still in progress — not a finished submission

            const score = parseInt(data.score ?? 0);
            const total = parseInt(data.total ?? 0);
            const percentage = total > 0 ? Math.round((score / total) * 100) : (parseInt(data.percentage) || 0);
            const gradeInfo = getGrade(percentage);
            const email = data.studentEmail || "";

            submissions.push({
                id: docSnap.id,
                studentId: data.studentId || "",
                name: nameCache[data.studentId] || email.split("@")[0] || "Unknown",
                email: email || "—",
                score,
                total,
                percentage,
                grade: gradeInfo.grade,
                gradeColor: gradeInfo.color,
                gradeBg: gradeInfo.bg,
                submittedAt: data.submittedAt,
                violationCount: parseInt(data.violationCount) || 0,
                maxViolations: parseInt(data.maxViolations) || 0,
                autoSubmitted: !!data.autoSubmitted
            });
        });

        submissions.sort((a, b) => {
            const t = (x) => x.submittedAt
                ? (x.submittedAt.toDate ? x.submittedAt.toDate().getTime() : new Date(x.submittedAt).getTime())
                : 0;
            return t(b) - t(a);
        });

        return submissions;
    } catch (err) {
        console.warn("Could not load exam submissions:", err.message);
        return [];
    }
}
