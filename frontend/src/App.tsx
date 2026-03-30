import { useState } from 'react';
import axios from 'axios';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';

type AppStep = 'upload' | 'loading' | 'results';
type AuthMode = 'login' | 'signup';

interface ReportDetail {
  id?: number;
  score: number;
  job_description: string;
  skills: string[];
  missing_skills: string[];
  suggestions: string[];
}

function App() {
  const API_URL = "https://ai-resume-analyzer-2apu.onrender.com";

  // --- PDF GENERATION LOGIC ---
  const generatePDF = () => {
    const doc = new jsPDF();
    const timestamp = new Date().toLocaleDateString();

    doc.setFontSize(20);
    doc.setTextColor(40, 44, 52);
    doc.text("AI Resume Analysis Report", 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${timestamp}`, 14, 30);

    doc.setFontSize(14);
    doc.setTextColor(0, 102, 204);
    doc.text(`Overall Match Score: ${score}%`, 14, 45);

    autoTable(doc, {
      startY: 55,
      head: [['Category', 'Details']],
      body: [
        ['Matched Skills', skills.join(', ') || 'None detected'],
        ['Missing Skills', missingSkills.join(', ') || 'None identified'],
      ],
      headStyles: { fillColor: [51, 65, 85] },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.setTextColor(40, 44, 52);
    doc.text("Actionable Steps to Improve:", 14, finalY);

    doc.setFontSize(11);
    doc.setTextColor(60);
    let currentY = finalY + 10;

    suggestions.forEach((step, index) => {
      const splitText = doc.splitTextToSize(`${index + 1}. ${step}`, 180);
      // Check if text will go off page
      if (currentY + (splitText.length * 7) > 280) {
        doc.addPage();
        currentY = 20;
      }
      doc.text(splitText, 14, currentY);
      currentY += (splitText.length * 7);
    });

    doc.save(`Resume_Analysis_${timestamp.replace(/\//g, '_')}.pdf`);
  };

  // --- AUTH STATE ---
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // --- APP STATE ---
  const [step, setStep] = useState<AppStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // --- AI DATA STATE ---
  const [score, setScore] = useState<number>(0);
  const [skills, setSkills] = useState<string[]>([]);
  const [missingSkills, setMissingSkills] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // --- HISTORY STATE ---
  const [history, setHistory] = useState<ReportDetail[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportDetail | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // --- HANDLERS ---
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (authMode === 'signup') {
        await axios.post(`${API_URL}/api/v1/auth/signup`, { name, email, password });
        setAuthMode('login');
        setAuthError('Signup successful! Please log in.');
      } else {
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);
        const response = await axios.post(`${API_URL}/api/v1/auth/login`, formData, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        localStorage.setItem('token', response.data.access_token);
        setToken(response.data.access_token);
      }
    } catch (error: any) {
      setAuthError(error.response?.data?.detail || "Authentication failed.");
    }
  };

  const pollAnalysisStatus = async (analysisId: number) => {
    try {
      const response = await axios.get(`${API_URL}/api/v1/analysis-status/${analysisId}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (response.data.is_ready) {
        const analysis = response.data.data;
        setScore(analysis.score || 0);
        setSkills(analysis.skills || []);
        setMissingSkills(analysis.missing_skills || []);
        setSuggestions(analysis.suggestions || []);
        setStep('results');
      } else {
        setTimeout(() => pollAnalysisStatus(analysisId), 2000);
      }
    } catch (error: any) {
      setErrorMessage("Lost connection to analysis server.");
      setStep('upload');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setErrorMessage("Please select a resume file first.");
      return;
    }
    setStep('loading');
    setErrorMessage('');
    const formData = new FormData();
    formData.append("file", file);
    formData.append("job_description", jobDescription);

    try {
      const response = await axios.post(`${API_URL}/api/v1/upload-resume/`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          "Authorization": `Bearer ${token}`
        },
      });
      const id = response.data.analysis_id;
      if (id) pollAnalysisStatus(id);
      else throw new Error("Invalid response");
    } catch (error: any) {
      setErrorMessage("Something went wrong during upload.");
      setStep('upload');
    }
  };

  const fetchMyHistory = async () => {
    setIsLoadingHistory(true);
    setShowHistory(true);
    try {
      const response = await axios.get(`${API_URL}/api/v1/my-history/`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      setHistory(response.data);
    } catch (error: any) {
      alert("Error loading history.");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setStep('upload');
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
          <h2 className="text-3xl font-extrabold text-center text-slate-800 mb-6">
            {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
          {authError && <div className="p-3 rounded-lg text-sm text-center mb-4 bg-red-100 text-red-700 font-bold">{authError}</div>}
          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === 'signup' && <input type="text" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} required className="w-full px-4 py-3 border rounded-xl" />}
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full px-4 py-3 border rounded-xl" />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full px-4 py-3 border rounded-xl" />
            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors">{authMode === 'login' ? 'Sign In' : 'Sign Up'}</button>
          </form>
          <p className="text-center mt-6 text-sm">
            <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-blue-600 font-bold underline">{authMode === 'login' ? 'Sign up here' : 'Log in here'}</button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-2xl flex justify-between items-center mb-8">
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">AI Resume Analyzer</h1>
        <button onClick={handleLogout} className="text-sm bg-slate-800 text-slate-300 px-4 py-2 rounded-lg border border-slate-700">Logout</button>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-2xl mb-12 min-h-[400px]">
        {step === 'upload' && (
          <div className="animate-fade-in">
            <h2 className="text-2xl font-bold mb-6 text-center">New Analysis</h2>
            <label className="block text-sm font-bold mb-2 uppercase">Job Description</label>
            <textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste JD here..." className="w-full h-32 px-4 py-3 bg-slate-50 border rounded-xl mb-6" />
            <div className="w-full border-2 border-dashed rounded-xl p-8 bg-slate-50 relative text-center">
              <input type="file" onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} className="absolute inset-0 opacity-0 cursor-pointer" accept=".pdf,.docx" />
              <p>{file ? file.name : "Drag resume here"}</p>
            </div>
            {errorMessage && <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-center font-bold">{errorMessage}</div>}
            <button onClick={handleUpload} disabled={!file} className="w-full mt-6 bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg disabled:bg-slate-200">Analyze Resume</button>
          </div>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center h-64">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <h2 className="text-xl font-bold">AI is thinking...</h2>
          </div>
        )}

        {step === 'results' && (
          <div className="animate-fade-in">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Results</h2>
              <div className="flex gap-2">
                <button onClick={generatePDF} className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-sm">Download PDF</button>
                <button onClick={() => setStep('upload')} className="bg-blue-50 text-blue-600 px-4 py-2 rounded-lg font-bold text-sm">New</button>
              </div>
            </div>
            <div className="bg-slate-50 p-6 rounded-2xl mb-6">
               <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-bold text-slate-600">OVERALL FIT</span>
                  <span className="text-3xl font-black text-blue-600">{score}%</span>
               </div>
               <div className="w-full bg-slate-200 h-4 rounded-full overflow-hidden">
                  <div className="bg-blue-500 h-full transition-all duration-1000" style={{ width: `${score}%` }}></div>
               </div>
            </div>
            {/* Skills grid and Suggestions list here... */}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;