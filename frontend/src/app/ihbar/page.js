"use client";

import { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  Trophy, 
  Users, 
  Target, 
  Leaf, 
  CheckCircle, 
  Clock, 
  MapPin, 
  Camera, 
  AlertTriangle, 
  Send, 
  XCircle, 
  Search, 
  FilePlus, 
  Award, 
  ChevronRight, 
  Lock, 
  Flame, 
  Droplets, 
  Wind, 
  Eye, 
  Map, 
  MousePointerSquareDashed, 
  BarChart3
} from 'lucide-react';
import TopNavbar from '@/components/TopNavbar';
import AuthModal from '@/components/AuthModal';

const TURKEY_DATA = {
  "İstanbul": { coords: { lat: 41.0082, lng: 28.9784 }, districts: { "Kadıköy": ["Caferağa", "Moda"], "Beşiktaş": ["Bebek", "Etiler"] } },
  "Ankara": { coords: { lat: 39.9208, lng: 32.8541 }, districts: { "Çankaya": ["Kızılay", "Bahçelievler"] } },
  "İzmir": { coords: { lat: 38.4192, lng: 27.1287 }, districts: { "Karşıyaka": ["Bostanlı", "Mavişehir"] } }
};

const LEADERBOARD_DATA = {
  'Tüm Zamanlar': [
    { id: 1, name: "Şeyma K.", points: 2450, rank: 1 },
    { id: 2, name: "Mehmet T.", points: 2120, rank: 2 },
    { id: 3, name: "Elif Y.", points: 1980, rank: 3 },
  ],
  'Bu Ay': [
    { id: 2, name: "Mehmet T.", points: 850, rank: 1 },
    { id: 1, name: "Şeyma K.", points: 720, rank: 2 },
  ]
};

const BADGES = [
  { id: 1, name: "İlk Adım", desc: "İlk ihbarını başarıyla oluşturdun.", icon: <Leaf size={24}/>, color: "text-emerald-600 bg-emerald-100 border-emerald-200" },
  { id: 2, name: "Ateş Söndürücü", desc: "Yangın risklerini bildirdin.", icon: <Flame size={24}/>, color: "text-orange-600 bg-orange-100 border-orange-200" },
  { id: 3, name: "Doğa Bekçisi", desc: "Toplam 1000 puana ulaştın.", icon: <Shield size={24}/>, color: "text-blue-600 bg-blue-100 border-blue-200" },
  { id: 4, name: "Keskin Göz", desc: "İhbarlarının %90'ı doğrulandı.", icon: <Eye size={24}/>, color: "text-purple-600 bg-purple-100 border-purple-200" },
  { id: 5, name: "Su Koruyucusu", desc: "Su kirliliği ihbarı onaylandı.", icon: <Droplets size={24}/>, color: "text-cyan-600 bg-cyan-100 border-cyan-200" },
  { id: 6, name: "Topluluk Lideri", desc: "Sıralamada ilk 3'e girdin.", icon: <Award size={24}/>, color: "text-yellow-600 bg-yellow-100 border-yellow-200" },
];

export default function IhbarDashboard() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [filter, setFilter] = useState('Tüm Zamanlar');

  // VERİTABANI BAĞLANDIĞINDA BU İSTATİSTİKLER API'DEN DİNAMİK OLARAK GELECEK
  const [stats, setStats] = useState({
    ihbar: 1248,
    kullanici: 892,
    cozulen: 674,
    dogruluk: 82
  });

  return (
    <main className="min-h-screen bg-[#F8FAFC] font-sans text-gray-900 pb-20 relative">
      
      <div 
        className="absolute inset-0 z-0 bg-fixed bg-cover bg-center opacity-80" 
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1511497584788-876760111969?q=80&w=2000&auto=format&fit=crop')" }}
      ></div>
      <div className="absolute inset-0 z-0 bg-white/60 backdrop-blur-lg"></div>

      <div className="relative z-50">
        <TopNavbar 
          user={loggedInUser} 
          onOpenAuth={() => setIsAuthModalOpen(true)} 
          onLogout={() => setLoggedInUser(null)} 
          onOpenReport={() => setIsReportModalOpen(true)} 
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto pt-28 px-4 sm:px-6 lg:px-8 space-y-6">
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 border border-white/50 shadow-xl flex flex-col justify-between">
            <div>
              <h1 className="text-4xl font-black text-gray-900 mb-2 tracking-tight">
                Doğayı Koru,<br/>
                <span className="text-emerald-600">Geleceğe Katkı Sağla</span>
              </h1>
              <p className="text-gray-600 font-medium text-sm mb-8">
                Çevremizdeki sorunları bildir, puan kazan, rozetlerini topla ve sıralamada yerini yükselt!
              </p>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-emerald-50/80 border border-emerald-100 p-4 rounded-2xl flex flex-col items-center text-center shadow-sm hover:-translate-y-1 transition">
                <Shield className="text-emerald-500 mb-2" size={28} />
                <span className="font-bold text-gray-800 text-sm">Doğrula</span>
                <span className="text-xs text-gray-500 font-medium">Yapay Zeka İle</span>
              </div>
              <div className="bg-blue-50/80 border border-blue-100 p-4 rounded-2xl flex flex-col items-center text-center shadow-sm hover:-translate-y-1 transition">
                <Target className="text-blue-500 mb-2" size={28} />
                <span className="font-bold text-gray-800 text-sm">Katkı Sağla</span>
                <span className="text-xs text-gray-500 font-medium">Temiz Çevre</span>
              </div>
              <div className="bg-yellow-50/80 border border-yellow-100 p-4 rounded-2xl flex flex-col items-center text-center shadow-sm hover:-translate-y-1 transition">
                <Trophy className="text-yellow-500 mb-2" size={28} />
                <span className="font-bold text-gray-800 text-sm">Puan Kazan</span>
                <span className="text-xs text-gray-500 font-medium">Özel Rozetler</span>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 border border-white/50 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold">İhbar Sistemi Hakkında</h2>
                <button 
                  onClick={() => alert("Detaylı Analiz sayfası yapım aşamasında. Veritabanı bağlandığında aktif olacak.")} 
                  className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition"
                >
                  <BarChart3 size={14}/> Detaylı Analizleri Gör
                </button>
              </div>
              <p className="text-gray-600 font-medium text-sm mb-6">
                GeoMorphosis ihbar sistemi, çevresel sorunları hızlı ve doğru tespit etmek için kullanıcıların gücünü bir araya getirir.
              </p>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-col items-center shadow-sm">
                <CheckCircle className="text-emerald-500 mb-2" size={24} />
                <span className="text-xl font-black text-gray-800">{stats.ihbar}</span>
                <span className="text-xs text-gray-500 font-bold">İhbar</span>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-col items-center shadow-sm">
                <Users className="text-blue-500 mb-2" size={24} />
                <span className="text-xl font-black text-gray-800">{stats.kullanici}</span>
                <span className="text-xs text-gray-500 font-bold">Kullanıcı</span>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-col items-center shadow-sm">
                <Target className="text-orange-500 mb-2" size={24} />
                <span className="text-xl font-black text-gray-800">{stats.cozulen}</span>
                <span className="text-xs text-gray-500 font-bold">Çözülen</span>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-col items-center shadow-sm">
                <Leaf className="text-purple-500 mb-2" size={24} />
                <span className="text-xl font-black text-gray-800">% {stats.dogruluk}</span>
                <span className="text-xs text-gray-500 font-bold">Doğruluk</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-white/50 shadow-xl">
          <h2 className="text-lg font-bold mb-6">İhbar Süreçleri Nasıl İlerliyor?</h2>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1">
              <div className="bg-emerald-50 p-4 rounded-2xl"><FilePlus className="text-emerald-600" size={24} /></div>
              <div>
                <span className="block font-bold text-sm">1. İhbar Oluştur</span>
                <span className="text-xs text-gray-500 font-medium">Sorunları haritadan işaretleyerek bildirin.</span>
              </div>
            </div>
            <ChevronRight className="hidden md:block text-gray-300" />
            <div className="flex items-center gap-4 flex-1">
              <div className="bg-blue-50 p-4 rounded-2xl"><Search className="text-blue-600" size={24} /></div>
              <div>
                <span className="block font-bold text-sm">2. İnceleme Süreci</span>
                <span className="text-xs text-gray-500 font-medium">Uzman ekibimiz ve yapay zeka doğrular.</span>
              </div>
            </div>
            <ChevronRight className="hidden md:block text-gray-300" />
            <div className="flex items-center gap-4 flex-1">
              <div className="bg-orange-50 p-4 rounded-2xl"><CheckCircle className="text-orange-600" size={24} /></div>
              <div>
                <span className="block font-bold text-sm">3. Sonuçlandırma</span>
                <span className="text-xs text-gray-500 font-medium">İhbar yetkili kurumlara iletilerek çözülür.</span>
              </div>
            </div>
            <ChevronRight className="hidden md:block text-gray-300" />
            <div className="flex items-center gap-4 flex-1">
              <div className="bg-purple-50 p-4 rounded-2xl"><Award className="text-purple-600" size={24} /></div>
              <div>
                <span className="block font-bold text-sm">4. Puan & Rozet</span>
                <span className="text-xs text-gray-500 font-medium">Puan toplayıp sıralamada yükselin.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white/80 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-white/50 shadow-xl flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Trophy className="text-yellow-500" size={20} /> En Çok Katkı Sağlayanlar
              </h2>
              <select 
                value={filter} 
                onChange={(e) => setFilter(e.target.value)} 
                className="bg-white border border-gray-200 text-sm font-bold rounded-xl px-3 py-2 outline-none cursor-pointer"
              >
                <option value="Tüm Zamanlar">Tüm Zamanlar</option>
                <option value="Bu Ay">Bu Ay Liderleri</option>
              </select>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-6 snap-x hide-scrollbar">
              {LEADERBOARD_DATA[filter].map((user) => (
                <div key={user.id} className="snap-start flex-shrink-0 flex flex-col items-center justify-center w-28 relative group">
                  <div className={`absolute -top-3 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold shadow-sm z-10 ${user.rank === 1 ? 'bg-yellow-400 text-white' : user.rank === 2 ? 'bg-gray-300 text-gray-800' : user.rank === 3 ? 'bg-orange-300 text-white' : 'bg-white border border-gray-200 text-gray-500'}`}>
                    {user.rank}
                  </div>
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold mb-3 border-2 ${user.rank === 1 ? 'border-yellow-400 bg-yellow-50 text-yellow-700' : user.rank === 2 ? 'border-gray-300 bg-gray-50 text-gray-700' : user.rank === 3 ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-gray-100 bg-white text-gray-500'}`}>
                    {user.name.charAt(0)}
                  </div>
                  <span className="font-bold text-sm text-center truncate w-full">{user.name}</span>
                  <div className="flex items-center gap-1 text-xs text-yellow-600 font-semibold mt-1">
                    <Trophy size={12} /> {user.points} <span className="text-[10px] text-gray-500 ml-0.5">Puan</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-auto bg-white/60 border border-gray-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-sm font-bold text-gray-600">Puanlama Özeti:</span>
              <div className="flex gap-4 text-xs font-semibold">
                <span className="flex items-center gap-1"><CheckCircle className="text-emerald-500" size={14}/> Doğru: <span className="text-emerald-600">+100</span></span>
                <span className="flex items-center gap-1"><XCircle className="text-red-400" size={14}/> Asılsız: <span className="text-red-500">-50</span></span>
                <span className="flex items-center gap-1"><Clock className="text-gray-400" size={14}/> Beklemede: 0</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1 space-y-6 flex flex-col">
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-3xl p-6 border border-emerald-200 shadow-xl text-center flex-1 flex flex-col justify-center">
              <div className="mx-auto w-14 h-14 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
                <Leaf className="text-emerald-600" size={28} />
              </div>
              <h3 className="text-xl font-black text-emerald-900 mb-2">Aramıza Katılın!</h3>
              <p className="text-sm text-emerald-700 font-medium mb-6 leading-relaxed">
                Doğayı korumak sizin elinizde. Hemen ücretsiz kayıt olun; çevrenizdeki sorunları bildirin ve sıralamada yerinizi alın!
              </p>
              {!loggedInUser ? (
                <button 
                  onClick={() => setIsAuthModalOpen(true)} 
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-emerald-500/30"
                >
                  Ücretsiz Kayıt Ol
                </button>
              ) : (
                <div className="w-full bg-white text-emerald-700 font-bold py-3.5 rounded-xl border border-emerald-200 flex items-center justify-center gap-2">
                  <CheckCircle size={18}/> Zaten Aramızdasınız!
                </div>
              )}
            </div>
          </div>
        </div>

        {/* --- BAŞARI ROZETLERİ (YENİ DÜZEN) --- */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-white/50 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Award className="text-blue-500" size={20} /> Başarı Rozetleri
            </h2>
            <span className="text-xs text-gray-500">Sistemde kazanabileceğiniz özel rozetler ve anlamları</span>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {BADGES.map((badge) => (
              <div 
                key={badge.id} 
                className="p-5 rounded-2xl border border-gray-100 bg-white/60 flex flex-col items-center justify-center text-center hover:bg-white hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
              >
                <div className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-2xl border-2 mb-3 shadow-sm ${badge.color}`}>
                  {badge.icon}
                </div>
                <h4 className="font-bold text-sm text-gray-900 mb-1 leading-tight">{badge.name}</h4>
                <p className="text-[11px] text-gray-500 font-medium leading-snug">{badge.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `.hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}} />

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        onLogin={(userData) => { setLoggedInUser(userData); setIsAuthModalOpen(false); }} 
      />
      
      <ReportModal 
        isOpen={isReportModalOpen} 
        onClose={() => setIsReportModalOpen(false)} 
        loggedInUser={loggedInUser} 
        onOpenAuth={() => setIsAuthModalOpen(true)} 
      />
    </main>
  );
}

// --- AKILLI ARAMA BİLEŞENİ (AUTOCOMPLETE) ---
function SearchableSelect({ placeholder, options, value, onChange, disabled }) {
  const [search, setSearch] = useState(value);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setSearch(value);
  }, [value]);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative w-full">
      <Map className="absolute left-3 top-3.5 text-gray-400" size={16} />
      <input
        type="text"
        autoComplete="off" 
        disabled={disabled}
        placeholder={placeholder}
        value={search}
        onChange={e => { 
          setSearch(e.target.value); 
          setIsOpen(true); 
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-9 pr-3 text-sm font-bold text-gray-700 outline-none focus:border-red-500 disabled:opacity-50 transition"
      />
      {isOpen && filtered.length > 0 && !disabled && (
        <div className="absolute top-full left-0 w-full mt-1 bg-white border border-gray-200 z-50 max-h-40 overflow-y-auto rounded-xl shadow-2xl">
          {filtered.map(opt => (
            <div 
              key={opt} 
              onMouseDown={() => { 
                onChange(opt); 
                setSearch(opt); 
                setIsOpen(false); 
              }} 
              className="p-3 hover:bg-red-50 cursor-pointer text-sm font-bold text-gray-700 transition"
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- İHBAR MODALI (KUSURSUZ HARİTA, ÇİZİM ARACI, GİZLİ YAZILAR VE ÇALIŞAN FOTOĞRAF YÜKLEME) ---
function ReportModal({ isOpen, onClose, loggedInUser, onOpenAuth }) {
  const [locating, setLocating] = useState(false);
  
  const [selectedIl, setSelectedIl] = useState('');
  const [selectedIlce, setSelectedIlce] = useState('');
  const [selectedMahalle, setSelectedMahalle] = useState('');
  const [autoAddress, setAutoAddress] = useState(''); 
  
  const [ihbarTuru, setIhbarTuru] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [location, setLocation] = useState({ lat: 41.0082, lng: 28.9784 }); 

  // FOTOĞRAF YÜKLEME STATE'LERİ
  const [photoPreview, setPhotoPreview] = useState(null);
  const fileInputRef = useRef(null);

  // ALAN ÇİZİM (DRAW) STATE'LERİ
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [drawEnd, setDrawEnd] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const mapContainerRef = useRef(null);

  if (!isOpen) {
    return null;
  }

  const handleIlChange = (il) => {
    setSelectedIl(il); 
    setSelectedIlce(''); 
    setSelectedMahalle(''); 
    setAutoAddress('');
    if (il && TURKEY_DATA[il]) {
      setLocation(TURKEY_DATA[il].coords);
    }
  };

  const handleGetLocation = () => {
    setLocating(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({ 
            lat: position.coords.latitude, 
            lng: position.coords.longitude 
          });
          setAutoAddress(`GPS Konumu: ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`);
          setLocating(false);
          setSelectedIl(''); 
          setSelectedIlce(''); 
          setSelectedMahalle('');
          setIsDrawMode(false);
        },
        (error) => {
          alert("Konum izni alınamadı. Lütfen listeden yazarak arama yapınız.");
          setLocating(false);
        },
        { enableHighAccuracy: true } 
      );
    }
  };

  // FARE İLE ALAN ÇİZİM FONKSİYONLARI
  const handleMouseDown = (e) => {
    if (!isDrawMode || !mapContainerRef.current) return;
    const rect = mapContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setDrawStart({ x, y });
    setDrawEnd({ x, y });
    setIsDrawing(true);
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || !isDrawMode || !mapContainerRef.current) return;
    const rect = mapContainerRef.current.getBoundingClientRect();
    setDrawEnd({ 
      x: e.clientX - rect.left, 
      y: e.clientY - rect.top 
    });
  };

  const handleMouseUp = () => {
    if (isDrawing && isDrawMode && drawStart && drawEnd) {
      setIsDrawing(false);
      
      const centerX = (drawStart.x + drawEnd.x) / 2;
      const centerY = (drawStart.y + drawEnd.y) / 2;
      
      const latDelta = (100 - centerY) * 0.0005; 
      const lngDelta = (centerX - 200) * 0.0005; 
      
      const selectedLat = location.lat + latDelta;
      const selectedLng = location.lng + lngDelta;

      setAutoAddress(`Haritadan Özel Alan İşaretlendi (Merkez: ${selectedLat.toFixed(5)}, ${selectedLng.toFixed(5)})`);
      setSelectedIl(''); 
      setSelectedIlce(''); 
      setSelectedMahalle('');
    }
  };

  // FOTOĞRAF YÜKLEME VE SİLME FONKSİYONLARI
  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = (e) => {
    e.stopPropagation(); 
    setPhotoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!loggedInUser) {
      onOpenAuth(); 
      return;
    }
    const payload = { 
      kullanici: loggedInUser.name, 
      il: selectedIl, 
      ilce: selectedIlce, 
      mahalle: selectedMahalle, 
      isaretliAdres: autoAddress, 
      koordinat: location, 
      alan: drawStart && drawEnd ? { start: drawStart, end: drawEnd } : null, 
      tur: ihbarTuru, 
      aciklama: aciklama, 
      fotograf: photoPreview, // Fotoğraf da artık veritabanına gidiyor!
      tarih: new Date().toISOString() 
    };
    
    console.log("Veritabanına Giden Veri:", payload);
    alert("İhbarınız başarıyla kaydedildi! (Detaylar Konsolda)");
    
    // Formu Temizle
    setSelectedIl(''); 
    setSelectedIlce(''); 
    setSelectedMahalle(''); 
    setAutoAddress(''); 
    setIhbarTuru(''); 
    setAciklama('');
    setPhotoPreview(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden relative flex flex-col max-h-[90vh]">
        
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
              <AlertTriangle className="text-red-600" size={24}/> İhbar Oluştur
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Lütfen gördüğünüz sorunu detaylıca bildirin.
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-500 rounded-full transition"
          >
            <XCircle size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
          
          <div>
            <div className="flex justify-between items-end mb-2">
              <label className="block text-xs font-bold text-gray-700 uppercase">1. Konum Bilgisi</label>
              <button 
                type="button" 
                onClick={handleGetLocation} 
                disabled={locating} 
                className="bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {locating ? 'Aranıyor...' : <><MapPin size={14}/> GPS İle Konumumu Bul</>}
              </button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <SearchableSelect 
                placeholder="İl Ara (Örn: İz...)" 
                options={Object.keys(TURKEY_DATA)} 
                value={selectedIl} 
                onChange={handleIlChange} 
              />
              <SearchableSelect 
                placeholder="İlçe Ara..." 
                options={selectedIl ? Object.keys(TURKEY_DATA[selectedIl].districts) : []} 
                value={selectedIlce} 
                onChange={(ilce) => { 
                  setSelectedIlce(ilce); 
                  setSelectedMahalle(''); 
                  setAutoAddress(''); 
                }} 
                disabled={!selectedIl} 
              />
              <SearchableSelect 
                placeholder="Mahalle Ara..." 
                options={selectedIlce ? TURKEY_DATA[selectedIl].districts[selectedIlce] : []} 
                value={selectedMahalle} 
                onChange={(mahalle) => { 
                  setSelectedMahalle(mahalle); 
                  setAutoAddress(''); 
                }} 
                disabled={!selectedIlce} 
              />
            </div>
            
            {/* YAKINLAŞTIRILABİLİR, ÇİZİM ARAÇLI VE GİZLİ YAZILARI OLAN HARİTA KUTUSU */}
            <div 
              ref={mapContainerRef}
              className="w-full h-64 bg-gray-200 border border-gray-300 rounded-2xl overflow-hidden relative shadow-inner"
            >
               {/* OSM YAZILARINI GİZLEMEK İÇİN TAŞAN İFRAME HİLESİ */}
               <div className="absolute top-[-45px] bottom-[-45px] left-0 right-0 pointer-events-none">
                 <iframe 
                   className="w-full h-full pointer-events-auto"
                   src={`https://www.openstreetmap.org/export/embed.html?bbox=${location.lng-0.005},${location.lat-0.005},${location.lng+0.005},${location.lat+0.005}&layer=mapnik&marker=${location.lat},${location.lng}`}
                   style={{ pointerEvents: isDrawMode ? 'none' : 'auto' }} 
                 ></iframe>
               </div>

               {/* Alan Çizim Katmanı */}
               {isDrawMode && (
                 <div 
                   className="absolute inset-0 z-10 cursor-crosshair"
                   style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                   onMouseDown={handleMouseDown}
                   onMouseMove={handleMouseMove}
                   onMouseUp={handleMouseUp}
                   onMouseLeave={handleMouseUp}
                 >
                   {drawStart && drawEnd && (
                     <div 
                       className="absolute bg-red-500/40 border-2 border-red-600"
                       style={{
                         left: Math.min(drawStart.x, drawEnd.x),
                         top: Math.min(drawStart.y, drawEnd.y),
                         width: Math.abs(drawEnd.x - drawStart.x),
                         height: Math.abs(drawEnd.y - drawStart.y),
                       }}
                     />
                   )}
                 </div>
               )}

               {/* Çizim Modunu Aç/Kapat Butonu */}
               <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 z-20 w-11/12 sm:w-auto">
                 <button 
                   type="button" 
                   onClick={() => { 
                     setIsDrawMode(!isDrawMode); 
                     setDrawStart(null); 
                     setDrawEnd(null); 
                     if(isDrawMode) setAutoAddress(''); 
                   }} 
                   className={`w-full px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg flex items-center justify-center gap-2 transition ${isDrawMode ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-white text-gray-800 border border-gray-200 hover:bg-gray-50'}`}
                 >
                   <MousePointerSquareDashed size={16} />
                   {isDrawMode ? "Çizimi İptal Et / Haritada Gezin" : "Haritada Alan İşaretle (Kutu Çiz)"}
                 </button>
               </div>
            </div>

            {/* Otomatik Adres veya Çizim Sonucu */}
            {autoAddress && (
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-2 animate-in fade-in zoom-in">
                <CheckCircle size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                <p className="text-xs font-bold text-emerald-800 leading-tight">{autoAddress}</p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-2">2. İhbar Türü</label>
            <select 
              required 
              value={ihbarTuru} 
              onChange={(e) => setIhbarTuru(e.target.value)} 
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none font-bold text-gray-700 focus:border-red-500 transition"
            >
              <option value="">Seçiniz...</option>
              <option value="yangin">🔥 Yangın / Duman Riski</option>
              <option value="cop">🗑️ Çöp ve Atık Birikimi</option>
              <option value="su">💧 Su / Deniz Kirliliği</option>
            </select>
          </div>

          {/* ÇALIŞAN FOTOĞRAF YÜKLEME ALANI */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-2">3. Görsel Kanıt</label>
            
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handlePhotoChange} 
            />

            {!photoPreview ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-2xl p-6 flex flex-col items-center justify-center text-gray-500 hover:bg-red-50 hover:border-red-400 transition cursor-pointer group"
              >
                <Camera size={24} className="text-gray-400 mb-2 group-hover:text-red-500 transition-colors" />
                <span className="font-bold text-sm text-gray-700 group-hover:text-red-600 transition-colors">
                  Fotoğraf yüklemek için tıklayın
                </span>
              </div>
            ) : (
              <div className="relative w-full h-48 rounded-2xl overflow-hidden border border-gray-200 shadow-sm group">
                <img src={photoPreview} alt="Yüklenen Kanıt" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button 
                    type="button"
                    onClick={removePhoto}
                    className="bg-red-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-red-700 transition shadow-lg"
                  >
                    <XCircle size={18} /> Fotoğrafı Kaldır
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-2">4. Açıklama</label>
            <textarea 
              required 
              value={aciklama} 
              onChange={(e) => setAciklama(e.target.value)} 
              rows="3" 
              placeholder="Adres ve olay hakkında detaylı bilgi verebilirsiniz..." 
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-red-500 font-medium resize-none transition"
            ></textarea>
          </div>

          <button 
            type="submit" 
            className={`w-full py-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all ${loggedInUser ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/30' : 'bg-gray-900 hover:bg-black text-white shadow-xl'}`}
          >
            {loggedInUser ? <><Send size={18} /> İhbarı Gönder</> : <><Lock size={18} /> İhbarı Göndermek İçin Kayıt Ol / Giriş Yap</>}
          </button>
        </form>
      </div>
    </div>
  );
}