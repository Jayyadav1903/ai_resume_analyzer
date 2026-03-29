import { useState } from 'react';
import axios from 'axios';

type AppStep = 'upload' | 'loading' | 'results';
type AuthMode = 'login' | 'signup';

// --- TYPE DEFINITIONS ---
interface ReportDetail {
  id?: number;
  score: number;
  job_description: string;
  skills: string[];
  missing_skills: string[];
  suggestions: string[];
}

function App() {
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

  // --- AUTHENTICATION HANDLERS ---
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    try {
      if (authMode === 'signup') {
        await axios.post('http://127.0.0.1:8000/api/v1/auth/signup', { name, email, password });
        setAuthMode('login'); 
        setAuthError('Signup successful! Please log in.');
      } else {
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);

        const response = await axios.post('http://127.0.0.1:8000/api/v1/auth/login', formData, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const accessToken = response.data.access_token;
        localStorage.setItem('token', accessToken);
        localStorage.setItem('user_id', response.data.user_id); 
        setToken(accessToken);
      }
    } catch (error: any) {
      setAuthError(error.response?.data?.detail || "Authentication failed.");
    }
  };

  const fetchMyHistory = async () => {
    setIsLoadingHistory(true);
    setShowHistory(true);
    
    try {
      const response = await axios.get("http://127.0.0.1:8000/api/v1/my-history/", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      setHistory(response.data);
    } catch (error: any) {
      console.error("Failed to fetch history:", error);
      alert(`Error loading history: ${error.response?.data?.detail || error.message}`); 
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user_id');
    setToken(null);
    resetApp();
  };

  // --- RESUME UPLOAD HANDLER ---
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
      const response = await axios.post("http://127.0.0.1:8000/api/v1/upload-resume/", formData, {
        headers: { 
          "Content-Type": "multipart/form-data",
          "Authorization": `Bearer ${token}` 
        },
      });
      
      if (response.data.ai_analysis && !response.data.ai_analysis.error) {
        const analysis = response.data.ai_analysis;
        setScore(analysis.score || 0);
        setSkills(analysis.skills || []);
        setMissingSkills(analysis.missing_skills || []);
        setSuggestions(analysis.suggestions || []);
        setStep('results');
      } else {
        throw new Error(response.data.error || "The AI could not analyze this resume.");
      }
      
    } catch (error: any) {
      console.error("Upload error:", error);
      if (error.response?.status === 401) {
        handleLogout(); 
      } else {
        setErrorMessage(error.message || "Something went wrong during upload.");
        setStep('upload'); 
      }
    }
  };

  const resetApp = () => {
    setFile(null);
    setJobDescription('');
    setScore(0);
    setSkills([]);
    setMissingSkills([]);
    setSuggestions([]);
    setErrorMessage('');
    setStep('upload');
  };

  // ==========================================
  // VIEW 1: THE UNAUTHENTICATED SCREEN
  // ==========================================
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
          <h2 className="text-3xl font-extrabold text-center text-slate-800 mb-6">
            {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
          
          {authError && (
            <div className={`p-3 rounded-lg text-sm text-center mb-4 font-bold ${authError.includes('successful') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {authError}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === 'signup' && (
              <input type="text" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} required className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
            )}
            <input type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} required className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
            
            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-md">
              {authMode === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <p className="text-center mt-6 text-sm text-slate-500">
            {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
            <button onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError(''); }} className="text-blue-600 font-bold hover:underline">
              {authMode === 'login' ? 'Sign up here' : 'Log in here'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: THE SECURE MAIN DASHBOARD
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center py-12 px-4 font-sans text-slate-800">
      
      <div className="w-full max-w-2xl flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            AI Resume Analyzer
          </h1>
        </div>
        <button onClick={handleLogout} className="text-sm bg-slate-800 text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors border border-slate-700">
          Secure Logout
        </button>
      </div>

      {/* --- MAIN WHITE CARD --- */}
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-2xl mb-12 min-h-[400px] flex flex-col">
        
        {step === 'upload' && (
          <div className="flex flex-col flex-grow animate-fade-in">
            <h2 className="text-2xl font-bold mb-6 text-slate-800 text-center">New Analysis</h2>
            
            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">
                Target Job Description (Optional)
              </label>
              <textarea 
                value={jobDescription} onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the job requirements here..."
                className="w-full h-32 px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 resize-none"
              />
            </div>

            <div className="mb-2">
               <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">
                Your Resume
              </label>
              <div className="w-full flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-8 bg-slate-50 hover:border-blue-400 transition-colors cursor-pointer relative">
                <input type="file" onChange={(e) => { if (e.target.files) setFile(e.target.files[0]); setErrorMessage(''); }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".pdf,.docx" />
                <div className="text-center">
                  <p className="text-slate-600 font-medium">{file ? file.name : "Click or drag resume here"}</p>
                </div>
              </div>
            </div>

            {errorMessage && <div className="w-full mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm text-center font-bold">{errorMessage}</div>}

            <button onClick={handleUpload} disabled={!file} className={`w-full mt-6 font-bold py-3 rounded-xl transition-all ${!file ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg'}`}>
              Analyze Resume securely
            </button>
          </div>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center flex-grow">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <h2 className="text-xl font-bold text-slate-800">Processing Data...</h2>
          </div>
        )}

        {/* --- THE NEW POLISHED RESULTS UI --- */}
        {step === 'results' && (
          <div className="flex flex-col flex-grow animate-fade-in">
            
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 mb-8 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-extrabold text-slate-800">Match Analysis</h2>
                <button onClick={resetApp} className="text-sm font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-4 py-2 rounded-lg transition-colors">
                  + New Analysis
                </button>
              </div>
              
              <div className="mt-2">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-bold text-slate-600 uppercase tracking-wider">Overall Fit</span>
                  <span className={`text-3xl font-black ${score >= 75 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {score}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden shadow-inner">
                  <div 
                    className={`h-4 rounded-full transition-all duration-1000 ease-out ${score >= 75 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} 
                    style={{ width: `${score}%` }}
                  ></div>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-white p-6 rounded-2xl border border-green-100 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-sm font-extrabold text-green-600 mb-4 uppercase tracking-wide flex items-center border-b border-green-50 pb-2">
                  <span className="mr-2 text-lg">✓</span> Detected Skills
                </h3>
                <div className="flex flex-wrap gap-2">
                  {skills.length > 0 ? skills.map((skill, i) => (
                    <span key={i} className="px-3 py-1.5 bg-green-50 border border-green-200 text-green-800 text-xs font-bold rounded-lg shadow-sm">
                      {skill}
                    </span>
                  )) : <span className="text-sm text-slate-400 italic">No specific skills matched.</span>}
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-red-100 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-sm font-extrabold text-red-600 mb-4 uppercase tracking-wide flex items-center border-b border-red-50 pb-2">
                  <span className="mr-2 text-lg">⚠</span> Missing / Gaps
                </h3>
                <div className="flex flex-wrap gap-2">
                  {missingSkills.length > 0 ? missingSkills.map((skill, i) => (
                    <span key={i} className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-800 text-xs font-bold rounded-lg shadow-sm">
                      {skill}
                    </span>
                  )) : <span className="text-sm text-slate-400 italic">No missing skills identified!</span>}
                </div>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm">
              <h3 className="text-sm font-extrabold text-blue-700 mb-4 uppercase tracking-wide flex items-center border-b border-blue-50 pb-2">
                <span className="mr-2 text-lg">💡</span> Actionable Steps
              </h3>
              <ul className="space-y-4">
                {suggestions.map((suggestion, i) => (
                  <li key={i} className="flex items-start text-sm text-slate-700 leading-relaxed">
                    <span className="bg-blue-100 text-blue-600 font-black rounded-full w-6 h-6 flex items-center justify-center mr-3 flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div> {/* <-- THIS IS THE DIV THAT WENT MISSING */}

      {/* --- SECURE HISTORY PANEL --- */}
      <div className="w-full max-w-2xl flex flex-col items-center">
        <button 
          onClick={() => {
            if (showHistory) setSelectedReport(null); 
            showHistory ? setShowHistory(false) : fetchMyHistory();
          }}
          className="text-slate-400 hover:text-white font-bold text-sm transition-colors mb-4"
        >
          {showHistory ? "Hide Past Analyses" : "View Past Analyses"}
        </button>

        {showHistory && (
          <div className="w-full bg-slate-800 p-6 rounded-xl border border-slate-700 animate-fade-in shadow-xl text-left">
            
            {/* DETAILS VIEW */}
            {selectedReport ? (
              <div className="animate-fade-in">
                <div className="flex justify-between items-center mb-4 border-b border-slate-600 pb-2">
                  <button 
                    onClick={() => setSelectedReport(null)}
                    className="text-blue-400 hover:text-blue-300 text-sm font-bold flex items-center gap-1"
                  >
                    ← Back to List
                  </button>
                  <div className={`text-white text-sm font-black px-3 py-1 rounded-md ${selectedReport.score >= 75 ? 'bg-green-500' : selectedReport.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}>
                    Score: {selectedReport.score}%
                  </div>
                </div>

                <div className="space-y-4 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                  {selectedReport.job_description && (
                    <div className="bg-slate-700 p-3 rounded-lg border border-slate-600">
                      <h4 className="text-white font-bold text-sm mb-1">Target Job Description</h4>
                      <p className="text-slate-300 text-xs italic line-clamp-3">{selectedReport.job_description}</p>
                    </div>
                  )}

                  <div>
                    <h4 className="text-white font-bold text-sm mb-2 text-blue-400">💡 Actionable Suggestions</h4>
                    <ul className="list-disc list-inside text-sm text-slate-300 space-y-1">
                      {selectedReport.suggestions?.map((suggestion, idx) => (
                        <li key={idx}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-700 p-3 rounded-lg border border-green-900/50">
                      <h4 className="text-green-400 font-bold text-sm mb-2">✅ Matched Skills</h4>
                      <div className="flex flex-wrap gap-1">
                        {selectedReport.skills?.length > 0 ? selectedReport.skills.map((skill, idx) => (
                          <span key={idx} className="bg-green-500/20 text-green-300 text-xs px-2 py-1 rounded">{skill}</span>
                        )) : <span className="text-xs text-slate-400">No specific skills matched.</span>}
                      </div>
                    </div>

                    <div className="bg-slate-700 p-3 rounded-lg border border-red-900/50">
                      <h4 className="text-red-400 font-bold text-sm mb-2">❌ Missing Skills</h4>
                      <div className="flex flex-wrap gap-1">
                        {selectedReport.missing_skills?.length > 0 ? selectedReport.missing_skills.map((skill, idx) => (
                          <span key={idx} className="bg-red-500/20 text-red-300 text-xs px-2 py-1 rounded">{skill}</span>
                        )) : <span className="text-xs text-slate-400">No missing skills identified!</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              
              /* LIST VIEW */
              <div>
                <h3 className="text-lg font-bold text-white mb-4 border-b border-slate-600 pb-2">My Saved Reports</h3>
                
                {isLoadingHistory ? (
                  <div className="flex justify-center items-center py-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                    <span className="ml-3 text-slate-400 text-sm animate-pulse">Fetching your reports...</span>
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-slate-400 text-sm italic text-center py-4">You haven't analyzed any resumes yet.</p>
                ) : (
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                    {history.map((hist, i) => (
                      <div 
                        key={i} 
                        onClick={() => setSelectedReport(hist)} 
                        className="bg-slate-700 p-4 rounded-lg border border-slate-600 flex justify-between items-center hover:border-blue-500 hover:bg-slate-600 cursor-pointer transition-all"
                      >
                        <div>
                          <p className="text-sm font-bold text-slate-200">
                            {hist.job_description ? "Targeted Match" : "General Analysis"}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            Matched: {hist.skills?.length || 0} | Missing: {hist.missing_skills?.length || 0}
                          </p>
                        </div>
                        <div className={`text-white text-sm font-black px-3 py-1 rounded-md ${hist.score >= 75 ? 'bg-green-500' : hist.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}>
                          {hist.score}%
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;