import { useState } from 'react';
import axios from 'axios';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';

type AppStep = 'upload' | 'loading' | 'results';
type AuthMode = 'login' | 'signup';

function App() {
  const API_URL = "http://localhost:8000";
  
  // --- STATE (Unchanged) ---
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [step, setStep] = useState<AppStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [score, setScore] = useState<number>(0);
  const [skills, setSkills] = useState<string[]>([]);
  const [missingSkills, setMissingSkills] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // --- PDF GENERATION LOGIC (Unchanged) ---
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
    doc.text("Actionable Steps to Improve:", 14, finalY);

    doc.setFontSize(11);
    doc.setTextColor(60);
    let currentY = finalY + 10;

    suggestions.forEach((step, index) => {
      const splitText = doc.splitTextToSize(`${index + 1}. ${step}`, 180);
      if (currentY + (splitText.length * 7) > 280) {
        doc.addPage();
        currentY = 20;
      }
      doc.text(splitText, 14, currentY);
      currentY += (splitText.length * 7);
    });

    doc.save(`Resume_Analysis_${timestamp.replace(/\//g, '_')}.pdf`);
  };

  // --- HANDLERS (Unchanged) ---
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

  const pollJobStatus = async (jobId: number) => {
    try{
      const response = await axios.get(`${API_URL}/api/v1/job/${jobId}`,{
        headers:{"Authorization":`Bearer ${token}`}
      });

      const jobStatus = response.data.status;
      const jobResult = response.data.result;

      if(jobStatus === 'completed'){
        setScore(jobResult.score || 0);
        setSkills(jobResult?.skills || []);
        setMissingSkills(jobResult?.missing_skills || []);
        setSuggestions(jobResult?.suggestions || []);
        setStep('results'); 
      } else if(jobStatus === 'failed'){
        setErrorMessage(jobResult?.error || "AI Analysis failed during processing.");
        setStep('upload');
      } else {
        setTimeout(()=> pollJobStatus(jobId),2000);
      }
    }catch(error){
      console.error("Polling error:", error);
      setErrorMessage("Lost connection to server while checking status.");
      setStep('upload');
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setStep('loading');
    setErrorMessage('');

    const formData = new FormData();
    formData.append("file", file);
    formData.append("job_description", jobDescription);

    try {
      const response = await axios.post(`${API_URL}/api/v1/analyze/`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          "Authorization": `Bearer ${token}`
        },
      });

      if(response.data.job_id){
        pollJobStatus(response.data.job_id);
      }
      else{
        throw new Error("No Job ID received");
      }
    }
    catch (error: any) {
      console.error("Upload error:", error);
      setErrorMessage(error.response?.data?.detail || "Upload failed. Please try again.");
      setStep('upload');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setStep('upload');
  };

  // ==========================================
  // --- NEW UI RENDERING ---
  // ==========================================

  // 1. PREMIUM AUTH SCREEN
  if (!token) {
    return (
      <div className="min-h-screen flex font-sans bg-white">
        {/* Left Side: Form */}
        <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 lg:p-24">
          <div className="w-full max-w-md">
            <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
              {authMode === 'login' ? 'Welcome back' : 'Create an account'}
            </h2>
            <p className="text-slate-500 mb-8">
              {authMode === 'login' ? 'Please enter your details to sign in.' : 'Start optimizing your resume with AI today.'}
            </p>

            {authError && (
              <div className="p-4 rounded-xl text-sm mb-6 bg-red-50 border border-red-100 text-red-600 font-medium">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-5">
              {authMode === 'signup' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label>
                  <input 
                    type="text" 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    required 
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" 
                    placeholder="John Doe"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
                <input 
                  type="email" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  required 
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" 
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
                <input 
                  type="password" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  required 
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" 
                  placeholder="••••••••"
                />
              </div>
              <button 
                type="submit" 
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 rounded-xl transition-all shadow-md shadow-indigo-200 hover:-translate-y-0.5 mt-2"
              >
                {authMode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>
            
            <p className="text-center mt-8 text-slate-500">
              {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
              <button 
                onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} 
                className="text-indigo-600 font-semibold hover:underline"
              >
                {authMode === 'login' ? 'Sign up' : 'Log in'}
              </button>
            </p>
          </div>
        </div>

        {/* Right Side: Graphic/Brand */}
        <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-indigo-600 to-purple-700 flex-col justify-between p-12 text-white relative overflow-hidden">
           <div className="relative z-10">
              <h1 className="text-2xl font-bold tracking-widest uppercase opacity-90">AI Resume Pro</h1>
           </div>
           <div className="relative z-10 max-w-lg">
              <h2 className="text-5xl font-black leading-tight mb-6">Land your dream job faster.</h2>
              <p className="text-indigo-100 text-lg leading-relaxed">Our RAG-powered engine matches your resume against real-world job descriptions to highlight exactly what hiring managers are looking for.</p>
           </div>
           {/* Abstract Background Shapes */}
           <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-white opacity-10 rounded-full blur-3xl"></div>
           <div className="absolute top-20 -left-20 w-72 h-72 bg-purple-500 opacity-20 rounded-full blur-3xl"></div>
        </div>
      </div>
    );
  }

  // 2. MAIN DASHBOARD UI
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      
      {/* Top Navbar */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <h1 className="text-xl font-black tracking-tight text-indigo-900">
          AI Resume<span className="text-indigo-600">Analyzer</span>
        </h1>
        <button 
          onClick={handleLogout} 
          className="text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          Sign Out
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto mt-10 px-4">
        
        {/* === UPLOAD STEP === */}
        {step === 'upload' && (
          <div className="bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-slate-100">
            <h2 className="text-3xl font-extrabold mb-2 tracking-tight">New Analysis</h2>
            <p className="text-slate-500 mb-8">Paste the job description and upload your resume to see your match score.</p>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Job Description</label>
                <textarea 
                  value={jobDescription} 
                  onChange={(e) => setJobDescription(e.target.value)} 
                  placeholder="Paste the full job posting here..." 
                  className="w-full h-40 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none" 
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Your Resume</label>
                <div className="w-full border-2 border-dashed border-slate-300 rounded-2xl p-10 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-400 transition-colors relative flex flex-col items-center justify-center text-center cursor-pointer group">
                  <input 
                    type="file" 
                    onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                    accept=".pdf,.docx" 
                  />
                  {/* Upload SVG Icon */}
                  <svg className="w-10 h-10 text-indigo-400 mb-3 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-slate-700 font-semibold text-lg">
                    {file ? file.name : "Click or drag resume here"}
                  </p>
                  <p className="text-slate-500 text-sm mt-1">PDF or DOCX (Max 5MB)</p>
                </div>
              </div>

              {errorMessage && (
                <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-semibold border border-red-100">
                  {errorMessage}
                </div>
              )}

              <button 
                onClick={handleUpload} 
                disabled={!file} 
                className="w-full mt-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:shadow-none hover:-translate-y-0.5 transition-all"
              >
                Start Analysis
              </button>
            </div>
          </div>
        )}

        {/* === LOADING STEP === */}
        {step === 'loading' && (
          <div className="bg-white p-12 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center justify-center py-32 text-center">
            <div className="relative w-20 h-20 mb-8">
               <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
               <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Analyzing Resume...</h2>
            <p className="text-slate-500 mt-2 max-w-sm">Comparing your skills against the job description using semantic search.</p>
          </div>
        )}

        {/* === RESULTS STEP === */}
        {step === 'results' && (
          <div className="space-y-6">
            
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight">Analysis Complete</h2>
                <p className="text-slate-500 text-sm">Review your custom insights below.</p>
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <button 
                  onClick={() => setStep('upload')} 
                  className="flex-1 sm:flex-none px-5 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  New Analysis
                </button>
                <button 
                  onClick={generatePDF} 
                  className="flex-1 sm:flex-none px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-md"
                >
                  Download PDF
                </button>
              </div>
            </div>
            
            {/* Top Grid: Score & Skills */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Score Card */}
              <div className="col-span-1 bg-gradient-to-br from-indigo-50 to-white rounded-3xl p-8 border border-indigo-100 flex flex-col items-center justify-center text-center shadow-sm">
                <p className="text-xs tracking-widest text-indigo-500 font-bold uppercase mb-4">Overall Match</p>
                <h1 className="text-7xl font-black text-slate-900 tracking-tighter">
                  {score}<span className="text-4xl text-slate-400">%</span>
                </h1>
                <p className="mt-4 text-slate-600 font-medium text-sm">
                  {score >= 75 ? "Excellent fit! You hit the core requirements." : score >= 50 ? "Good foundation, but missing some skills." : "Consider tailoring your resume more."}
                </p>
              </div>

              {/* Skills Cards */}
              <div className="col-span-1 lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Matched */}
                <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-sm flex flex-col">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                    <h3 className="font-bold text-slate-900 text-lg">Matched Skills</h3>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-auto">
                    {skills.length > 0 ? (
                      skills.map((skill, i) => (
                        <span key={i} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-lg text-sm font-semibold">
                          {skill}
                        </span>
                      ))
                    ) : <p className="text-sm text-slate-500 italic">No specific matches.</p>}
                  </div>
                </div>

                {/* Missing */}
                <div className="bg-white rounded-3xl p-6 border border-rose-100 shadow-sm flex flex-col">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                    <h3 className="font-bold text-slate-900 text-lg">Missing Skills</h3>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-auto">
                    {missingSkills.length > 0 ? (
                      missingSkills.map((skill, i) => (
                        <span key={i} className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200/60 rounded-lg text-sm font-semibold">
                          {skill}
                        </span>
                      ))
                    ) : <p className="text-sm text-slate-500 italic">None identified!</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* Actionable Suggestions (Upgraded to Cards) */}
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
              <h3 className="text-xl font-extrabold text-slate-900 mb-6 tracking-tight">Actionable Suggestions</h3>
              <div className="grid gap-4">
                {suggestions.map((suggestion, index) => (
                  <div key={index} className="flex gap-4 p-5 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-indigo-50/50 transition-colors">
                    {/* Target Icon */}
                    <svg className="w-6 h-6 text-indigo-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-slate-700 leading-relaxed font-medium">{suggestion}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}

export default App;