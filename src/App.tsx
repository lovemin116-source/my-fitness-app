import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { 
  Scale, Target, TrendingDown, Plus, Trash2, Activity, 
  Dumbbell, ChevronDown, ChevronUp, Ruler, Edit2, Copy, Check, X, 
  AlertCircle, Database, LogOut, Loader2, RefreshCw, Upload, Download, 
  FileJson, Calculator, Cloud, Share2, Camera, Image as ImageIcon, Search, Calendar as CalendarIcon, KeyRound, LineChart as ChartIcon
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged
} from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- 您私人的 Firebase 設定 ---
const firebaseConfig = {
  apiKey: "AIzaSyAKgPusc2ckogI6S2tkytNKZqpu-TiR8ig",
  authDomain: "roygym2-ce85c.firebaseapp.com",
  projectId: "roygym2-ce85c",
  storageBucket: "roygym2-ce85c.firebasestorage.app",
  messagingSenderId: "476108578502",
  appId: "1:476108578502:web:9d26dd1c1323b3e24081c7"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 固定參數
const FIXED_COLLECTION = 'my_data';
const FIXED_DOC_ID = 'master_sheet'; 

// --- 圖片處理工具 ---
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        resolve(dataUrl);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

// --- 型別定義 ---
interface BodyEntry {
  id: string;
  date: string;
  weight: number;
  bodyFat?: number;
  photo?: string;
}
interface Goals {
  targetWeight: number | string;
  targetBodyFat: number | string;
  targetDate: string;
}
type MuscleGroup = '胸' | '肩' | '背';
type EquipmentType = '槓鈴' | '啞鈴' | '自體重';
type WeightUnit = 'kg' | 'lbs';
interface Exercise {
  id: string;
  name: string;
  muscle: MuscleGroup;
  type: EquipmentType;
}
interface TrainingLog {
  id: string;
  exerciseId: string;
  date: string;
  weight: number;
  reps: number;
  originalWeight: number;
  originalUnit: WeightUnit;
}
interface UserData {
  goals: Goals;
  entries: BodyEntry[];
  exercises: Exercise[];
  logs: TrainingLog[];
}
const DEFAULT_GOALS: Goals = { targetWeight: 60, targetBodyFat: 20, targetDate: '2025-12-31' };
const DEFAULT_DATA: UserData = {
  goals: DEFAULT_GOALS,
  entries: [],
  exercises: [],
  logs: []
};

// --- 輔助元件 ---
const ConfirmModal = ({ isOpen, message, onConfirm, onCancel, isDestructive = false }: { isOpen: boolean, message: string, onConfirm: () => void, onCancel: () => void, isDestructive?: boolean }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-100">
        <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
          <AlertCircle className={isDestructive ? "text-red-500" : "text-slate-600"} size={20} />
          請確認
        </h3>
        <p className="text-slate-600 mb-6 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl font-medium text-sm">取消</button>
          <button onClick={onConfirm} className={`px-4 py-2 text-white rounded-xl font-medium text-sm shadow-sm ${isDestructive ? 'bg-red-500 hover:bg-red-600' : 'bg-slate-800 hover:bg-slate-900'}`}>確定</button>
        </div>
      </div>
    </div>
  );
};

const DataTransferModal = ({ isOpen, type, data, onImport, onClose }: { isOpen: boolean, type: 'export' | 'import', data?: UserData, onImport?: (data: UserData) => void, onClose: () => void }) => {
  const [jsonString, setJsonString] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && type === 'export' && data) {
      setJsonString(JSON.stringify(data, null, 2));
      setCopySuccess(false);
    } else {
      setJsonString('');
      setImportError(null);
    }
  }, [isOpen, type, data]);

  const handleCopy = () => {
    const textArea = document.createElement("textarea");
    textArea.value = jsonString;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Copy failed', err);
    }
    document.body.removeChild(textArea);
  };

  const handleImportSubmit = () => {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed.goals || !Array.isArray(parsed.entries)) throw new Error("無效格式");
      if (onImport) onImport(parsed);
      onClose();
    } catch (e) {
      setImportError("格式錯誤，請確認貼上的是完整代碼。");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-100 flex flex-col max-h-[80vh]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            {type === 'export' ? <Download size={20} className="text-indigo-500"/> : <Upload size={20} className="text-teal-500"/>}
            {type === 'export' ? '匯出備份 (複製代碼)' : '匯入還原 (貼上代碼)'}
          </h3>
          <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
        </div>
        
        {type === 'export' && (
           <div className="bg-indigo-50 p-3 rounded-lg text-indigo-700 text-xs mb-3 flex items-start gap-2">
             <AlertCircle size={14} className="mt-0.5 shrink-0"/>
             <span>請全選並複製下方代碼，傳送到您的手機或另一台電腦，使用「匯入」功能即可同步資料。</span>
           </div>
        )}

        <textarea 
          className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-lg p-3 font-mono text-xs text-slate-600 resize-none outline-none focus:ring-2 focus:ring-indigo-500 mb-4 min-h-[200px]"
          value={jsonString}
          onChange={e => setJsonString(e.target.value)}
          readOnly={type === 'export'}
          onClick={type === 'export' ? e => e.currentTarget.select() : undefined}
          placeholder={type === 'import' ? '在此貼上資料代碼...' : ''}
        />
        {importError && <div className="text-red-500 text-xs mb-3 flex items-center gap-1"><AlertCircle size={12}/> {importError}</div>}
        <div className="flex justify-end gap-2">
          {type === 'export' ? (
            <button onClick={handleCopy} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${copySuccess ? 'bg-green-100 text-green-700' : 'bg-indigo-600 text-white'}`}>{copySuccess ? <><Check size={16}/> 已複製</> : <><Copy size={16}/> 複製代碼</>}</button>
          ) : (
            <button onClick={handleImportSubmit} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"><Check size={16}/> 確認匯入</button>
          )}
        </div>
      </div>
    </div>
  );
};

// --- 輔助函式 ---
const calculateBodyStats = (entries: BodyEntry[]) => {
  if (!entries || entries.length === 0) return [];
  const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const withAvg = sorted.map((entry) => {
    const currentDate = new Date(entry.date).getTime();
    const last7DaysEntries = sorted.filter(e => {
      const d = new Date(e.date).getTime();
      return d <= currentDate && d > currentDate - (24 * 60 * 60 * 1000 * 7);
    });
    const sumWeight = last7DaysEntries.reduce((sum, e) => sum + e.weight, 0);
    const avgWeight = last7DaysEntries.length > 0 ? sumWeight / last7DaysEntries.length : entry.weight;
    return { ...entry, avgWeight: parseFloat(avgWeight.toFixed(2)) };
  });
  return withAvg.map((entry, index) => {
    let isGain = false;
    if (index > 0) isGain = entry.avgWeight > withAvg[index - 1].avgWeight;
    return { ...entry, isGain };
  });
};
const lbsToKg = (lbs: number) => lbs / 2.20462;
const calculate1RM = (weight: number, reps: number) => {
  if (!reps || reps <= 1) return weight;
  return weight * (1 + reps / 30);
};

// --- 頁面元件：體態追蹤 ---
const BodyMetricsView = ({ data, onUpdate }: { data: UserData, onUpdate: (newData: UserData) => void }) => {
  const [inputDate, setInputDate] = useState(new Date().toISOString().split('T')[0]);
  const [inputWeight, setInputWeight] = useState('');
  const [inputBodyFat, setInputBodyFat] = useState('');
  const [inputPhoto, setInputPhoto] = useState<string | undefined>(undefined);
  const [isEditingGoals, setIsEditingGoals] = useState(false);
  const [localGoals, setLocalGoals] = useState<Goals>(data.goals);
  
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editEntryDate, setEditEntryDate] = useState('');
  const [editEntryWeight, setEditEntryWeight] = useState('');
  const [editEntryBodyFat, setEditEntryBodyFat] = useState('');
  const [editEntryPhoto, setEditEntryPhoto] = useState<string | undefined>(undefined);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (data.goals) setLocalGoals(data.goals); }, [data.goals]);

  const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; message: string; action: () => void; isDestructive: boolean; }>({ isOpen: false, message: '', action: () => {}, isDestructive: false });

  const chartData = useMemo(() => calculateBodyStats(data.entries), [data.entries]);
  
  const chartDomain = useMemo(() => {
    const weights = data.entries.map(e => e.weight);
    const target = Number(data.goals.targetWeight);
    if (!isNaN(target)) weights.push(target);
    if (weights.length === 0) return ['auto', 'auto'];
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    return [Math.floor(min - 1), Math.ceil(max + 1)];
  }, [data.entries, data.goals.targetWeight]);

  const currentStats = useMemo(() => {
    if (!data.entries || data.entries.length === 0) return null;
    return [...data.entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }, [data.entries]);
  const daysRemaining = useMemo(() => {
    if (!data.goals) return 0;
    const today = new Date();
    const target = new Date(data.goals.targetDate);
    return Math.max(0, Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
  }, [data.goals]);

  const handleSaveGoals = () => { onUpdate({ ...data, goals: localGoals }); setIsEditingGoals(false); };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const compressed = await compressImage(e.target.files[0]);
        setInputPhoto(compressed);
      } catch (err) {
        console.error("Photo process error", err);
        alert("照片處理失敗");
      }
    }
  };
  
  const handleEditFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const compressed = await compressImage(e.target.files[0]);
        setEditEntryPhoto(compressed);
      } catch (err) {
        console.error("Photo process error", err);
        alert("照片處理失敗");
      }
    }
  };

  const handleAddEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputWeight || !inputDate) return;
    const newEntry: BodyEntry = {
      id: Date.now().toString(), date: inputDate, weight: parseFloat(inputWeight),
      ...(inputBodyFat ? { bodyFat: parseFloat(inputBodyFat) } : {}),
      ...(inputPhoto ? { photo: inputPhoto } : {})
    };
    const existingIndex = data.entries.findIndex(ent => ent.date === inputDate);
    if (existingIndex >= 0) {
      setModalConfig({
        isOpen: true, message: '這一天已經有紀錄了，要覆蓋它嗎？', isDestructive: false,
        action: () => {
          const newEntries = [...data.entries];
          if (!inputPhoto && newEntries[existingIndex].photo) {
             newEntry.photo = newEntries[existingIndex].photo;
          }
          newEntries[existingIndex] = { ...newEntry, id: newEntries[existingIndex].id };
          onUpdate({ ...data, entries: newEntries });
          setInputWeight(''); setInputBodyFat(''); setInputPhoto(undefined);
          setModalConfig(prev => ({ ...prev, isOpen: false }));
        }
      });
    } else {
      onUpdate({ ...data, entries: [...data.entries, newEntry] });
      setInputWeight(''); setInputBodyFat(''); setInputPhoto(undefined);
    }
  };

  const handleDeleteEntry = (id: string) => {
    setModalConfig({
      isOpen: true, message: '確定要刪除這筆紀錄嗎？', isDestructive: true,
      action: () => {
        onUpdate({ ...data, entries: data.entries.filter(e => e.id !== id) });
        setModalConfig(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const startEditEntry = (entry: BodyEntry) => { 
    setEditingEntryId(entry.id); 
    setEditEntryDate(entry.date); 
    setEditEntryWeight(entry.weight.toString()); 
    setEditEntryBodyFat(entry.bodyFat ? entry.bodyFat.toString() : '');
    setEditEntryPhoto(entry.photo);
  };

  const saveEditEntry = () => {
    if (editingEntryId && editEntryWeight && editEntryDate) {
      const updatedEntries = data.entries.map(e => {
        if (e.id === editingEntryId) {
          return {
            ...e,
            date: editEntryDate,
            weight: parseFloat(editEntryWeight),
            bodyFat: editEntryBodyFat ? parseFloat(editEntryBodyFat) : undefined,
            photo: editEntryPhoto
          };
        }
        return e;
      });
      onUpdate({ ...data, entries: updatedEntries });
      setEditingEntryId(null);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <ConfirmModal isOpen={modalConfig.isOpen} message={modalConfig.message} onConfirm={modalConfig.action} onCancel={() => setModalConfig(prev => ({ ...prev, isOpen: false }))} isDestructive={modalConfig.isDestructive} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex justify-between mb-4"><div className="flex items-center gap-2"><Target size={20}/><h2 className="font-semibold">我的目標</h2></div><button onClick={() => isEditingGoals ? (onUpdate({ ...data, goals: localGoals }), setIsEditingGoals(false)) : setIsEditingGoals(true)} className="text-xs text-teal-600 bg-teal-50 px-2 py-1 rounded">{isEditingGoals ? '儲存' : '修改'}</button></div>
          {isEditingGoals ? <div className="space-y-3"><input type="number" value={localGoals.targetWeight} onChange={e=>setLocalGoals({...localGoals, targetWeight: e.target.value})} className="w-full border p-2 text-sm rounded"/><input type="number" value={localGoals.targetBodyFat} onChange={e=>setLocalGoals({...localGoals, targetBodyFat: e.target.value})} className="w-full border p-2 text-sm rounded"/><input type="date" value={localGoals.targetDate} onChange={e=>setLocalGoals({...localGoals, targetDate: e.target.value})} className="w-full border p-2 text-sm rounded"/></div> 
          : <div className="space-y-4"><div className="flex justify-between"><span className="text-sm text-slate-500">目標體重</span><span className="text-xl font-bold">{data.goals?.targetWeight} kg</span></div><div className="flex justify-between"><span className="text-sm text-slate-500">目標體脂</span><span className="text-xl font-bold">{data.goals?.targetBodyFat} %</span></div><div className="pt-2 border-t mt-2 flex justify-between text-sm"><span className="text-slate-500">剩餘天數</span><span className="font-bold text-orange-500">{daysRemaining} 天</span></div></div>}
        </div>
        <div className="md:col-span-2 bg-gradient-to-br from-teal-600 to-teal-700 text-white p-6 rounded-2xl shadow-md">
           <h2 className="text-teal-100 font-medium flex items-center gap-2"><Scale size={18} /> 當前狀態</h2>
           {currentStats && <div className="mt-4 flex justify-between items-end"><div><div className="text-3xl font-bold">{currentStats.weight} kg</div><div className="text-sm text-teal-100 opacity-80">距離目標: {(currentStats.weight - Number(data.goals.targetWeight)).toFixed(1)} kg</div></div><div className="text-right"><div className="text-xs text-teal-100 opacity-70">7日平均</div><div className="text-xl font-bold">{chartData.find(d => d.date === currentStats.date)?.avgWeight} kg</div></div></div>}
        </div>
      </div>
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h2 className="font-semibold text-slate-600 mb-4 flex items-center gap-2"><Plus size={20}/> 新增體重/照片</h2>
        <form onSubmit={handleAddEntry} className="flex flex-col md:flex-row gap-4 items-end">
          <div className="w-full md:w-auto flex-1"><label className="text-xs text-slate-500 block">日期</label><input type="date" required value={inputDate} onChange={e=>setInputDate(e.target.value)} className="w-full border p-2 rounded" /></div>
          <div className="w-full md:w-auto flex-1"><label className="text-xs text-slate-500 block">體重 (kg)</label><input type="number" step="0.1" required value={inputWeight} onChange={e=>setInputWeight(e.target.value)} className="w-full border p-2 rounded" /></div>
          <div className="w-full md:w-auto flex-1"><label className="text-xs text-slate-500 block">體脂 (%)</label><input type="number" step="0.1" placeholder="選填" value={inputBodyFat} onChange={e=>setInputBodyFat(e.target.value)} className="w-full border p-2 rounded" /></div>
          <div className="w-full md:w-auto flex items-end">
            <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            <button type="button" onClick={() => fileInputRef.current?.click()} className={`p-2.5 rounded border border-slate-200 flex items-center gap-2 ${inputPhoto ? 'bg-teal-50 text-teal-600 border-teal-200' : 'bg-white text-slate-500'}`}>
               <Camera size={20} /> {inputPhoto ? '已選照片' : '體態照'}
            </button>
          </div>
          <button type="submit" className="w-full md:w-auto bg-teal-600 text-white px-6 py-2 rounded font-medium">儲存</button>
        </form>
      </div>
      {data.entries.length > 0 && (
        <>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-[300px]">
            <h2 className="font-semibold text-slate-600 mb-4 flex items-center gap-2"><Activity size={20}/> 體重趨勢</h2>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                <XAxis 
                  dataKey="date" 
                  tickFormatter={s=>s.slice(5)} 
                  fontSize={12} 
                  stroke="#334155" 
                  tick={{ fill: '#000000', fontWeight: 700 }}
                  tickMargin={10}
                />
                <YAxis 
                  domain={chartDomain} 
                  fontSize={12} 
                  stroke="#334155" 
                  tick={{ fill: '#000000', fontWeight: 700 }}
                  unit="kg"
                />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend wrapperStyle={{paddingTop: '10px'}}/>
                <ReferenceLine y={Number(data.goals.targetWeight)} label={{ value: "目標", fill: "#dc2626", fontSize: 13, fontWeight: '800', position: 'insideTopRight' }} stroke="#dc2626" strokeWidth={4} strokeDasharray="0" opacity={1}/>
                <Line name="體重" dataKey="weight" stroke="#94a3b8" strokeWidth={2} dot={{r:3}} activeDot={{r:5}}/>
                <Line name="7日平均" dataKey="avgWeight" stroke="#0d9488" strokeWidth={3} dot={(p:any)=>{const {cx,cy,payload,key}=p;if(payload.isGain){return<circle key={key} cx={cx} cy={cy} r={5} fill="#ef4444" stroke="#fff" strokeWidth={2}/>}return<circle key={key} cx={cx} cy={cy} r={0} />}} activeDot={{r:6}}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b font-semibold text-slate-700">歷史紀錄</div>
            <div className="max-h-60 overflow-y-auto divide-y">
              {[...data.entries].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()).map(e => (
                <div key={e.id} className="p-3 flex justify-between items-center hover:bg-slate-50">
                  {editingEntryId === e.id ? (
                    <div className="flex flex-wrap gap-2 w-full items-center">
                      <input type="date" value={editEntryDate} onChange={ev=>setEditEntryDate(ev.target.value)} className="border p-1 text-sm w-32"/>
                      <input type="number" value={editEntryWeight} onChange={ev=>setEditEntryWeight(ev.target.value)} className="border p-1 text-sm w-20"/>
                      <input type="number" value={editEntryBodyFat} onChange={ev=>setEditEntryBodyFat(ev.target.value)} className="border p-1 text-sm w-16" placeholder="體脂"/>
                      <input type="file" accept="image/*" className="hidden" ref={editFileInputRef} onChange={handleEditFileChange} />
                      <button onClick={() => editFileInputRef.current?.click()} className={`p-1.5 rounded border flex items-center justify-center w-8 ${editEntryPhoto ? 'bg-teal-50 text-teal-600 border-teal-200' : 'text-slate-400'}`} title="更換照片"><Camera size={16}/></button>
                      <div className="flex gap-1 ml-auto"><button onClick={saveEditEntry} className="text-green-600 ml-auto"><Check size={16}/></button><button onClick={()=>setEditingEntryId(null)} className="text-slate-400"><X size={16}/></button></div>
                    </div>
                  ) : (
                    <><div className="flex gap-4 items-center"><span className="text-slate-500 text-sm">{e.date}</span><span className="font-bold">{e.weight} kg</span>{e.bodyFat && <span className="text-slate-600 text-sm">{e.bodyFat}%</span>}{e.photo && <ImageIcon size={16} className="text-teal-500" />}</div><div className="flex gap-2"><button onClick={()=>startEditEntry(e)} className="text-slate-400 hover:text-teal-600"><Edit2 size={16}/></button><button onClick={() => handleDeleteEntry(e.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={16}/></button></div></>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// --- 新增：體態分析頁面 ---
const BodyAnalysisView = ({ data }: { data: UserData }) => {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const filteredEntries = useMemo(() => {
    // 篩選出有照片的紀錄，並按日期由舊到新排序 (Ascending)
    return data.entries.filter(e => e.date >= startDate && e.date <= endDate && e.photo)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data.entries, startDate, endDate]);

  const diffWeight = useMemo(() => {
    // 計算該區間所有體重數據的變化 (不論有無照片)
    const allEntriesInRange = data.entries.filter(e => e.date >= startDate && e.date <= endDate)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
    if (allEntriesInRange.length < 2) return 0;
    const first = allEntriesInRange[0].weight; // 第一筆 (最舊)
    const last = allEntriesInRange[allEntriesInRange.length - 1].weight; // 最後一筆 (最新)
    return (last - first).toFixed(1);
  }, [data.entries, startDate, endDate]);

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4 items-center justify-between">
         <div className="flex items-center gap-2 w-full md:w-auto">
            <CalendarIcon size={20} className="text-slate-500"/>
            <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="border p-2 rounded text-sm"/>
            <span className="text-slate-400">至</span>
            <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} className="border p-2 rounded text-sm"/>
         </div>
         <div className="flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-lg">
            <span className="text-xs text-slate-500">區間變化</span>
            <span className={`font-bold text-lg ${Number(diffWeight) > 0 ? 'text-red-500' : 'text-green-600'}`}>{Number(diffWeight) > 0 ? '+' : ''}{diffWeight} kg</span>
         </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredEntries.map(entry => (
          <div key={entry.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex flex-col relative group">
             <div className="aspect-square bg-slate-100 relative">
               <img src={entry.photo} alt={entry.date} className="w-full h-full object-cover" />
               <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-10">
                 <div className="flex justify-between items-end">
                   <div>
                       <div className="text-white/90 text-xs font-medium mb-0.5">{entry.date}</div>
                       <div className="text-white font-bold text-xl">{entry.weight} <span className="text-xs font-normal opacity-80">kg</span></div>
                   </div>
                   {entry.bodyFat && <div className="text-white/90 text-sm font-medium bg-white/20 backdrop-blur-md px-2 py-1 rounded-lg">{entry.bodyFat}%</div>}
                 </div>
               </div>
             </div>
          </div>
        ))}
        {filteredEntries.length === 0 && <div className="col-span-full text-center py-10 text-slate-400">此區間無照片紀錄</div>}
      </div>
    </div>
  );
};

// --- 頁面元件：肌力訓練 ---
const StrengthTrainingView = ({ data, onUpdate }: { data: UserData, onUpdate: (newData: UserData) => void }) => {
  const [filterMuscle, setFilterMuscle] = useState<MuscleGroup | '全部'>('全部');
  const [isAddingExercise, setIsAddingExercise] = useState(false);
  const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; message: string; action: () => void; isDestructive: boolean; }>({ isOpen: false, message: '', action: () => {}, isDestructive: false });
  const [newExName, setNewExName] = useState('');
  const [newExMuscle, setNewExMuscle] = useState<MuscleGroup>('胸');
  const [newExType, setNewExType] = useState<EquipmentType>('槓鈴');

  const handleAddExercise = () => {
    if (!newExName) return;
    onUpdate({ ...data, exercises: [...data.exercises, { id: Date.now().toString(), name: newExName, muscle: newExMuscle, type: newExType }] });
    setNewExName(''); setIsAddingExercise(false);
  };

  const handleAddLog = (exerciseId: string, date: string, weight: number, reps: number, unit: WeightUnit) => {
    const weightKg = unit === 'kg' ? weight : lbsToKg(weight);
    onUpdate({ ...data, logs: [...data.logs, { id: Date.now().toString() + Math.random(), exerciseId, date, weight: parseFloat(weightKg.toFixed(2)), reps, originalWeight: weight, originalUnit: unit }] });
  };

  const handleUpdateLog = (logId: string, date: string, weight: number, reps: number, unit: WeightUnit) => {
    const weightKg = unit === 'kg' ? weight : lbsToKg(weight);
    onUpdate({ ...data, logs: data.logs.map(log => log.id === logId ? { ...log, date, originalWeight: weight, reps, originalUnit: unit, weight: parseFloat(weightKg.toFixed(2)) } : log) });
  };

  const handleDeleteLog = (logId: string) => {
    setModalConfig({ isOpen: true, message: '確定要刪除這筆訓練紀錄嗎？', isDestructive: true, action: () => { onUpdate({ ...data, logs: data.logs.filter(l => l.id !== logId) }); setModalConfig(prev => ({ ...prev, isOpen: false })); } });
  };

  const filteredExercises = data.exercises.filter(ex => filterMuscle === '全部' || ex.muscle === filterMuscle);

  return (
    <div className="space-y-6 pb-20">
       <ConfirmModal isOpen={modalConfig.isOpen} message={modalConfig.message} onConfirm={modalConfig.action} onCancel={() => setModalConfig(prev => ({ ...prev, isOpen: false }))} isDestructive={modalConfig.isDestructive} />
       <div className="flex flex-col gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
         <div className="flex justify-between items-center">
            <h2 className="font-bold text-slate-700 flex items-center gap-2"><Dumbbell size={20}/> 動作管理</h2>
            <button onClick={() => setIsAddingExercise(!isAddingExercise)} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 transition-transform active:scale-95"><Plus size={16}/> 新增</button>
         </div>
         {isAddingExercise && (
           <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-3 animate-in slide-in-from-top-2">
              <input placeholder="動作名稱" value={newExName} onChange={e => setNewExName(e.target.value)} className="md:col-span-2 px-3 py-2 border rounded text-sm outline-none" />
              <select value={newExMuscle} onChange={e => setNewExMuscle(e.target.value as MuscleGroup)} className="px-3 py-2 border rounded text-sm outline-none bg-white"><option value="胸">胸部</option><option value="肩">肩膀</option><option value="背">背部</option></select>
              <select value={newExType} onChange={e => setNewExType(e.target.value as EquipmentType)} className="px-3 py-2 border rounded text-sm outline-none bg-white"><option value="槓鈴">槓鈴</option><option value="啞鈴">啞鈴</option><option value="自體重">自體重</option></select>
              <button onClick={handleAddExercise} className="w-full bg-slate-800 text-white py-2 rounded text-sm font-medium">確認</button>
           </div>
         )}
         <div className="flex gap-2 overflow-x-auto pb-1">{['全部', '胸', '背', '肩'].map(m => (<button key={m} onClick={() => setFilterMuscle(m as any)} className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${filterMuscle === m ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{m}</button>))}</div>
       </div>
       <div className="space-y-4">{filteredExercises.map(ex => (<ExerciseCard key={ex.id} exercise={ex} logs={data.logs.filter(l => l.exerciseId === ex.id)} onAddLog={handleAddLog} onDeleteLog={handleDeleteLog} onUpdateLog={handleUpdateLog} />))}</div>
    </div>
  );
};

const ExerciseCard = ({ exercise, logs, onAddLog, onDeleteLog, onUpdateLog }: { exercise: Exercise, logs: TrainingLog[], onAddLog: any, onDeleteLog: any, onUpdateLog: any }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [logWeight, setLogWeight] = useState('');
  const [logReps, setLogReps] = useState('5');
  const [logUnit, setLogUnit] = useState<WeightUnit>('kg');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editReps, setEditReps] = useState('');
  const [editUnit, setEditUnit] = useState<WeightUnit>('kg');

  const chartData = useMemo(() => {
    const dailyStats: { [key: string]: { actual: number, oneRM: number } } = {};
    logs.forEach(log => {
      const currentOneRM = calculate1RM(log.weight, log.reps || 1);
      if (!dailyStats[log.date]) { dailyStats[log.date] = { actual: log.weight, oneRM: currentOneRM }; } 
      else { if (log.weight > dailyStats[log.date].actual) dailyStats[log.date].actual = log.weight; if (currentOneRM > dailyStats[log.date].oneRM) dailyStats[log.date].oneRM = currentOneRM; }
    });
    return Object.keys(dailyStats).sort((a,b)=>new Date(a).getTime()-new Date(b).getTime()).map(date => ({ date, actual: parseFloat(dailyStats[date].actual.toFixed(1)), oneRM: parseFloat(dailyStats[date].oneRM.toFixed(1)) }));
  }, [logs]);

  const actualMax = logs.length > 0 ? Math.max(...logs.map(l=>l.weight)) : 0;
  const max1RM = logs.length > 0 ? Math.max(...logs.map(l=>calculate1RM(l.weight, l.reps||1))) : 0;
  
  const convertedDisplay = useMemo(() => {
    const val = parseFloat(logWeight);
    if (isNaN(val)) return '';
    return logUnit === 'kg' ? `≈ ${(val * 2.20462).toFixed(1)} lbs` : `≈ ${(val / 2.20462).toFixed(1)} kg`;
  }, [logWeight, logUnit]);

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if(!logWeight) return; onAddLog(exercise.id, logDate, parseFloat(logWeight), parseInt(logReps), logUnit); setLogWeight(''); };
  const startEdit = (log: TrainingLog) => { setEditingId(log.id); setEditDate(log.date); setEditWeight(log.originalWeight.toString()); setEditReps(log.reps.toString()); setEditUnit(log.originalUnit); };
  const saveEdit = () => { if(editingId && editWeight) { onUpdateLog(editingId, editDate, parseFloat(editWeight), parseInt(editReps), editUnit); setEditingId(null); } };
  const copyLog = (log: TrainingLog) => { setLogDate(log.date); setLogWeight(log.originalWeight.toString()); setLogReps((log.reps||1).toString()); setLogUnit(log.originalUnit); };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden transition-all duration-300">
      <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50" onClick={()=>setIsExpanded(!isExpanded)}>
        <div className="flex items-center gap-3"><div className={`p-2 rounded-lg ${exercise.muscle === '胸' ? 'bg-rose-100 text-rose-600' : exercise.muscle === '背' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}><Dumbbell size={20}/></div><div><h3 className="font-bold text-slate-800">{exercise.name}</h3><div className="text-[10px] text-slate-400">{exercise.type}</div></div></div>
        <div className="flex items-center gap-4"><div className="text-right flex flex-col gap-1"><div className="text-[10px] text-slate-400">實際最大: <strong className="text-slate-700">{actualMax}kg</strong></div><div className="text-[10px] text-indigo-400">預估 1RM: <strong className="font-bold">{max1RM.toFixed(1)}kg</strong></div></div>{isExpanded ? <ChevronUp size={20} className="text-slate-300"/> : <ChevronDown size={20} className="text-slate-300"/>}</div>
      </div>
      {isExpanded && (
        <div className="border-t p-4 bg-slate-50/50 space-y-4">
          {chartData.length > 0 && (
            <div className="h-56 w-full bg-white p-2 rounded-xl border border-slate-200">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(str) => str.slice(5)} stroke="#94a3b8" fontSize={10} />
                  <YAxis domain={['auto', 'auto']} stroke="#94a3b8" fontSize={10} />
                  <Tooltip labelStyle={{fontSize: '12px'}} itemStyle={{fontSize: '12px'}} />
                  <Legend wrapperStyle={{fontSize: '10px', paddingTop: '10px'}} />
                  <Line name="實際最大重量" type="monotone" dataKey="actual" stroke="#1e293b" strokeWidth={2} dot={{r: 3}} />
                  <Line name="預估 1RM" type="monotone" dataKey="oneRM" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 5" dot={{r: 2}} />
                </LineChart>
              </ResponsiveContainer>
              <div className="text-[10px] text-center text-slate-400 mt-2 flex items-center justify-center gap-1"><ChartIcon size={10}/> 動作重量進度趨勢</div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-end bg-white p-3 rounded-lg border border-slate-200">
             <div className="w-[30%] min-w-[100px]"><label className="text-[10px] text-slate-400">日期</label><input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} className="w-full text-xs py-1 border-b" /></div>
             <div className="w-[20%]"><label className="text-[10px] text-slate-400">重量</label><input id={`input-weight-${exercise.id}`} type="number" step="0.1" value={logWeight} onChange={e => setLogWeight(e.target.value)} placeholder="0" className="w-full text-xs py-1 border-b" /></div>
             <div className="w-[15%]"><label className="text-[10px] text-slate-400">次數</label><input type="number" value={logReps} onChange={e => setLogReps(e.target.value)} placeholder="5" className="w-full text-xs py-1 border-b" /></div>
             <div className="w-[15%]"><label className="text-[10px] text-slate-400">單位</label><select value={logUnit} onChange={e => setLogUnit(e.target.value as WeightUnit)} className="w-full text-xs bg-transparent border-b"><option value="kg">kg</option><option value="lbs">lbs</option></select></div>
             <button type="submit" className="flex-1 bg-indigo-600 text-white p-2 rounded-md"><Plus size={16}/></button>
             <div className="w-full text-[10px] text-slate-400 mt-1">{convertedDisplay}</div>
          </form>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {[...logs].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(log => (
              <div key={log.id} className="flex justify-between items-center text-sm p-2 bg-white rounded border border-slate-100 group">
                {editingId === log.id ? (
                  <div className="flex gap-1 w-full"><input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="w-24 text-[10px]" /><input type="number" value={editWeight} onChange={e => setEditWeight(e.target.value)} className="w-12 text-[10px]" /><input type="number" value={editReps} onChange={e => setEditReps(e.target.value)} className="w-8 text-[10px]" /><button onClick={saveEdit} className="text-green-600 ml-auto"><Check size={14}/></button></div>
                ) : (
                  <><div className="flex gap-3 items-center"><span className="text-slate-500 text-[10px] w-14">{log.date.slice(5)}</span><span className="font-medium text-slate-700">{log.originalWeight} {log.originalUnit} x {log.reps}</span><span className="text-[10px] text-indigo-400 bg-indigo-50 px-1.5 rounded">1RM: {calculate1RM(log.weight, log.reps).toFixed(0)}</span></div><div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => copyLog(log)} className="text-slate-400 hover:text-indigo-600 p-1"><Copy size={12}/></button><button onClick={() => startEdit(log)} className="text-slate-400 hover:text-indigo-600 p-1"><Edit2 size={12}/></button><button onClick={() => onDeleteLog(log.id)} className="text-slate-400 hover:text-red-500 p-1"><Trash2 size={12}/></button></div></>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// --- 主程式 ---
const BodyGoalPro = () => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'body' | 'strength' | 'analysis'>('body');
  const [userData, setUserData] = useState<UserData>(DEFAULT_DATA);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  // 新增：錯誤訊息狀態
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) { 
        console.error("Auth error:", error); 
        setErrorMsg("登入失敗，請檢查 Firebase Console 的 Authentication 設定 (是否啟用匿名登入)");
      }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  // 2. Data Sync
  useEffect(() => {
    if (loading || !user) return;
    setIsDataLoading(true);
    // 使用固定的集合名稱 (my_data) 與文件 ID (master_sheet)
    const docRef = doc(db, FIXED_COLLECTION, FIXED_DOC_ID);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      setIsDataLoading(false);
      setErrorMsg(null); // Clear error on success
      if (docSnap.exists()) {
        const rawData = docSnap.data() as Partial<UserData>;
        setUserData({
          goals: rawData.goals || DEFAULT_GOALS,
          entries: rawData.entries || [],
          exercises: rawData.exercises || [],
          logs: rawData.logs || []
        });
      } else {
        setUserData(DEFAULT_DATA);
      }
    }, (err) => {
      console.error("Data sync error:", err);
      setIsDataLoading(false);
      // 顯示明確的錯誤原因
      if (err.code === 'permission-denied') {
        setErrorMsg("權限不足：請檢查 Firebase Console 的 Firestore Rules 是否設為 'allow read, write: if true;'");
      } else {
        setErrorMsg(`連線錯誤: ${err.message}`);
      }
    });
    return () => unsubscribe();
  }, [loading, user]);

  const handleUpdateData = async (newData: UserData) => {
    setUserData(newData);
    try {
      const sanitizedData = JSON.parse(JSON.stringify(newData));
      // 使用固定的集合名稱 (my_data) 與文件 ID (master_sheet)
      const docRef = doc(db, FIXED_COLLECTION, FIXED_DOC_ID);
      await setDoc(docRef, sanitizedData);
      setErrorMsg(null);
    } catch (e: any) {
      console.error("Save error:", e);
      if (e.code === 'permission-denied') {
        setErrorMsg("儲存失敗：資料庫拒絕寫入 (請檢查 Rules)");
      } else {
        setErrorMsg("儲存失敗，請檢查網路");
      }
    }
  };

  const handleResetData = async () => {
    if(!confirm("確定要清空所有資料？此動作無法復原！")) return;
    handleUpdateData(DEFAULT_DATA);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500"><Loader2 className="animate-spin mr-2"/> 載入中...</div>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <div className="max-w-4xl mx-auto">
        <DataTransferModal isOpen={isExportModalOpen} type="export" data={userData} onClose={() => setIsExportModalOpen(false)} />
        <DataTransferModal isOpen={isImportModalOpen} type="import" onImport={handleUpdateData} onClose={() => setIsImportModalOpen(false)} />
        
        {/* 錯誤訊息顯示列 */}
        {errorMsg && (
          <div className="bg-red-50 text-red-600 px-4 py-3 text-sm font-medium border-b border-red-100 flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0"/>
            {errorMsg}
          </div>
        )}

        <header className="bg-white p-4 sticky top-0 z-10 shadow-sm border-b border-slate-100 flex items-center justify-between">
           <div className="flex items-center gap-3">
             <div className={`p-2 rounded-lg text-white transition-colors ${activeTab === 'body' ? 'bg-teal-600' : 'bg-indigo-600'}`}>
               {isDataLoading ? <Loader2 size={24} className="animate-spin"/> : <Activity size={24} />}
             </div>
             <div><h1 className="text-xl font-bold">BodyGoal Pro</h1><p className="text-[10px] text-slate-500">雲端資料庫 (Private)</p></div>
           </div>
           <div className="flex items-center gap-1">
              <button onClick={() => setIsExportModalOpen(true)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="匯出備份"><Upload size={18} /></button>
              <button onClick={() => setIsImportModalOpen(true)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="匯入還原"><Cloud size={18} /></button>
              <button onClick={handleResetData} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="清空"><RefreshCw size={18} /></button>
           </div>
        </header>
        <main className="p-4">
          {activeTab === 'body' && <BodyMetricsView data={userData} onUpdate={handleUpdateData} />}
          {activeTab === 'strength' && <StrengthTrainingView data={userData} onUpdate={handleUpdateData} />}
          {activeTab === 'analysis' && <BodyAnalysisView data={userData} />}
        </main>
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 pb-safe">
          <div className="max-w-4xl mx-auto flex justify-around">
            <button onClick={() => setActiveTab('body')} className={`flex-1 py-3 flex flex-col items-center gap-1 text-[10px] font-medium transition-colors ${activeTab === 'body' ? 'text-teal-600' : 'text-slate-400 hover:text-slate-600'}`}><Ruler size={24} strokeWidth={activeTab === 'body' ? 2.5 : 2} />體態追蹤</button>
            <button onClick={() => setActiveTab('analysis')} className={`flex-1 py-3 flex flex-col items-center gap-1 text-[10px] font-medium transition-colors ${activeTab === 'analysis' ? 'text-orange-500' : 'text-slate-400'}`}><Search size={24} strokeWidth={activeTab === 'analysis' ? 2.5 : 2} />體態分析</button>
            <button onClick={() => setActiveTab('strength')} className={`flex-1 py-3 flex flex-col items-center gap-1 text-[10px] font-medium transition-colors ${activeTab === 'strength' ? 'text-indigo-600' : 'text-slate-400'}`}><Dumbbell size={24} strokeWidth={activeTab === 'strength' ? 2.5 : 2} />肌力訓練</button>
          </div>
        </nav>
      </div>
    </div>
  );
};

export default BodyGoalPro;
