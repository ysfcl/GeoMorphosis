"use client";

import { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  AlertTriangle, 
  Users, 
  MessageSquare, 
  Settings, 
  CheckCircle, 
  XCircle, 
  Ban, 
  Mail, 
  Check, 
  X,
  Search,
  Filter,
  Save,
  Trash2,
  Unlock,
  MapPin,
  MousePointerSquareDashed,
  Reply,
  Send // İŞTE EKSİK OLAN İKON BURAYA EKLENDİ!
} from 'lucide-react';

// --- MOCK VERİLER (API Bağlanınca Sunucudan Gelecek) ---
const INITIAL_REPORTS = [
  { id: '#1045', type: 'Yangın Riski', location: 'Kadıköy, İstanbul', user: 'Şeyma K.', date: '10 Dk Önce', status: 'pending', description: 'Ormanlık alanda yoğun duman var.' },
  { id: '#1044', type: 'Atık Birikimi', location: 'Çankaya, Ankara', user: 'Mehmet T.', date: '1 Saat Önce', status: 'pending', description: 'Park köşesinde inşaat atıkları bırakılmış.' },
  { id: '#1043', type: 'Su Kirliliği', location: 'Bostanlı, İzmir', user: 'Elif Y.', date: '3 Saat Önce', status: 'approved', description: 'Deniz yüzeyinde yağ tabakası mevcut.' },
];

const INITIAL_USERS = [
  { id: 1, name: 'Şeyma K.', email: 'seyma@ornek.com', reports: 12, points: 720, status: 'active', isNew: false, date: '12.01.2025' },
  { id: 2, name: 'Ahmet K.', email: 'ahmet@mail.com', reports: 4, points: 150, status: 'active', isNew: true, date: 'Bugün' },
  { id: 3, name: 'Spamcı', email: 'spam@fake.com', reports: 0, points: -50, status: 'banned', isNew: false, date: '05.10.2024' },
  { id: 4, name: 'Doğa Dostu', email: 'doga@gmail.com', reports: 25, points: 1500, status: 'active', isNew: false, date: '20.08.2023' }
];

const INITIAL_MESSAGES = [
  { id: 1, sender: 'Ahmet K.', email: 'ahmet@mail.com', subject: 'Puanım Yüklenmedi', message: 'Merhaba, dün yaptığım ihbar onaylandı ama 100 puanım hesabıma yansımadı.', date: '2 saat önce', isRead: false },
  { id: 2, sender: 'Sistem', email: 'system@geomorphosis.com', subject: 'Sunucu Uyarısı', message: 'Platform güvenlik yaması dün gece başarıyla tamamlandı.', date: '1 gün önce', isRead: true }
];

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('reports');
  
  // State'ler
  const [reports, setReports] = useState(INITIAL_REPORTS);
  const [users, setUsers] = useState(INITIAL_USERS);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [userFilter, setUserFilter] = useState('all'); 
  
  // Genel Ayarlar State'i
  const [settings, setSettings] = useState({
    siteName: 'GeoMorphosis',
    adminEmail: 'admin@geomorphosis.com',
    maintenanceMode: false,
    allowNewRegistrations: true
  });

  // Sayfa yüklendiğinde Tarayıcı Hafızasından (LocalStorage) Bakım Modunu Çek
  useEffect(() => {
    const savedMaintenance = localStorage.getItem('geomorphosis_maintenance');
    if (savedMaintenance === 'true') {
      setSettings(prev => ({ ...prev, maintenanceMode: true }));
    }
  }, []);

  // Özel Bildirim (Toast) State'i
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Modallar için State'ler
  const [rejectModal, setRejectModal] = useState({ isOpen: false, reportId: null, reason: '' });
  const [mailModal, setMailModal] = useState({ isOpen: false, userEmail: '', subject: '', message: '' });

  // Bildirim Gösterme Fonksiyonu
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'success' });
    }, 3000);
  };

  // --- İHBAR İŞLEMLERİ ---
  const handleApprove = (id) => {
    setReports(reports.map(r => r.id === id ? { ...r, status: 'approved' } : r));
    showToast(`${id} numaralı ihbar başarıyla onaylandı ve puan eklendi.`, 'success');
  };

  const openRejectModal = (id) => {
    setRejectModal({ isOpen: true, reportId: id, reason: '' });
  };

  const confirmReject = () => {
    if (rejectModal.reason.trim() === '') {
      showToast('Lütfen reddetme sebebini boş bırakmayınız.', 'error');
      return;
    }
    setReports(reports.map(r => r.id === rejectModal.reportId ? { ...r, status: 'rejected', rejectReason: rejectModal.reason } : r));
    showToast(`${rejectModal.reportId} numaralı ihbar reddedildi. Kullanıcıya bilgi geçildi.`, 'error');
    setRejectModal({ isOpen: false, reportId: null, reason: '' });
  };

  // --- KULLANICI İŞLEMLERİ ---
  const handleToggleBan = (id, currentStatus, name) => {
    const newStatus = currentStatus === 'active' ? 'banned' : 'active';
    setUsers(users.map(u => u.id === id ? { ...u, status: newStatus } : u));
    if (newStatus === 'banned') {
      showToast(`${name} isimli kullanıcı sistemden engellendi.`, 'error');
    } else {
      showToast(`${name} isimli kullanıcının engeli kaldırıldı.`, 'success');
    }
  };

  const openMailModal = (email) => {
    setMailModal({ isOpen: true, userEmail: email, subject: '', message: '' });
  };

  const sendMail = (e) => {
    e.preventDefault();
    showToast(`${mailModal.userEmail} adresine mail başarıyla gönderildi.`, 'success');
    setMailModal({ isOpen: false, userEmail: '', subject: '', message: '' });
  };

  const filteredUsers = users.filter(user => {
    if (userFilter === 'all') return true;
    if (userFilter === 'new') return user.isNew;
    return user.status === userFilter;
  });

  // --- MESAJ İŞLEMLERİ ---
  const markAsRead = (id) => {
    setMessages(messages.map(m => m.id === id ? { ...m, isRead: true } : m));
    showToast('Mesaj okundu olarak işaretlendi.', 'success');
  };

  const deleteMessage = (id) => {
    setMessages(messages.filter(m => m.id !== id));
    showToast('Mesaj kalıcı olarak silindi.', 'error');
  };

  // Mesaja Cevap Verme İşlemi
  const handleReplyMessage = (email, subject) => {
    setMailModal({ 
      isOpen: true, 
      userEmail: email, 
      subject: `Ynt: ${subject}`, 
      message: '' 
    });
  };

  // --- AYARLAR İŞLEMİ ---
  const saveSettings = (e) => {
    e.preventDefault();
    localStorage.setItem('geomorphosis_maintenance', settings.maintenanceMode);
    showToast('Sistem genel ayarları başarıyla kaydedildi ve uygulandı.', 'success');
  };

  // Okunmamış mesaj sayısı
  const unreadMessagesCount = messages.filter(m => !m.isRead).length;

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans flex text-gray-900 relative">
      
      {/* ÖZEL SAĞ ALT BİLDİRİM (TOAST) KUTUSU */}
      <div className={`fixed bottom-6 right-6 z-[9999] transition-all duration-300 transform ${toast.show ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'}`}>
        <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl border ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {toast.type === 'success' ? <CheckCircle size={20} className="text-emerald-500" /> : <AlertTriangle size={20} className="text-red-500" />}
          <span className="text-sm font-bold">{toast.message}</span>
        </div>
      </div>

      {/* SOL MENÜ (SIDEBAR) - ORMAN YEŞİLİ TEMA */}
      <aside className="w-64 bg-emerald-950 text-emerald-50 flex flex-col fixed h-full z-20 shadow-2xl">
        <div className="p-6 border-b border-emerald-900/50 flex items-center gap-3">
          <div className="bg-emerald-500/20 p-2 rounded-xl">
            <ShieldCheck className="text-emerald-400" size={28} />
          </div>
          <div>
            <h1 className="font-black text-lg tracking-tight text-white">Yönetim</h1>
            <p className="text-xs text-emerald-400/80 font-medium">GeoMorphosis Panel</p>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 mt-2">
          <button onClick={() => setActiveTab('reports')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-200 ${activeTab === 'reports' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50' : 'text-emerald-200 hover:bg-emerald-900 hover:text-white'}`}>
            <AlertTriangle size={18} /> Gelen İhbarlar
            {reports.filter(r=>r.status === 'pending').length > 0 && (
              <span className="ml-auto bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">{reports.filter(r=>r.status === 'pending').length}</span>
            )}
          </button>
          
          <button onClick={() => setActiveTab('users')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-200 ${activeTab === 'users' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50' : 'text-emerald-200 hover:bg-emerald-900 hover:text-white'}`}>
            <Users size={18} /> Kullanıcı Yönetimi
          </button>
          
          <button onClick={() => setActiveTab('messages')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-200 ${activeTab === 'messages' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50' : 'text-emerald-200 hover:bg-emerald-900 hover:text-white'}`}>
            <MessageSquare size={18} /> Sistem Mesajları
            {unreadMessagesCount > 0 && (
              <span className="ml-auto bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full">{unreadMessagesCount}</span>
            )}
          </button>
          
          <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-200 ${activeTab === 'settings' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50' : 'text-emerald-200 hover:bg-emerald-900 hover:text-white'}`}>
            <Settings size={18} /> Genel Ayarlar
          </button>
        </nav>
        
        <div className="p-4 border-t border-emerald-900/50">
          <button onClick={() => window.location.href = '/ihbar'} className="w-full flex items-center justify-center gap-2 bg-emerald-900 hover:bg-emerald-800 text-emerald-100 py-3.5 rounded-xl text-sm font-bold transition">
            Sisteme Geri Dön
          </button>
        </div>
      </aside>

      {/* SAĞ İÇERİK ALANI */}
      <main className="ml-64 flex-1 p-8 lg:p-10">
        
        <header className="flex justify-between items-center mb-8 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <div>
            <h2 className="text-2xl font-black text-gray-800 tracking-tight">
              {activeTab === 'reports' && 'Bekleyen İhbar Yönetimi'}
              {activeTab === 'users' && 'Kullanıcı ve Hesap Yönetimi'}
              {activeTab === 'messages' && 'Gelen Sistem Mesajları'}
              {activeTab === 'settings' && 'Sistem Genel Ayarları'}
            </h2>
            <p className="text-sm text-gray-500 font-medium mt-1">İlgili modüldeki detayları yönetebilir ve aksiyon alabilirsiniz.</p>
          </div>
          <div className="flex items-center gap-3">
            {settings.maintenanceMode ? (
              <div className="bg-red-50 px-4 py-2.5 rounded-xl border border-red-100 text-sm font-bold text-red-700 flex items-center gap-2">
                <AlertTriangle size={16} /> Bakım Modu Aktif
              </div>
            ) : (
              <div className="bg-emerald-50 px-4 py-2.5 rounded-xl border border-emerald-100 text-sm font-bold text-emerald-700 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> Sistem Yayında
              </div>
            )}
          </div>
        </header>

        {/* 1. İHBARLAR SEKMESİ */}
        {activeTab === 'reports' && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-xs uppercase font-black text-gray-500 tracking-wider">
                    <th className="p-5">ID</th>
                    <th className="p-5">İhbar Detayı</th>
                    <th className="p-5">Konum</th>
                    <th className="p-5">Kullanıcı / Tarih</th>
                    <th className="p-5 text-center">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-semibold text-gray-700">
                  {reports.map((report) => (
                    <tr key={report.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition">
                      <td className="p-5 text-gray-400 font-bold">{report.id}</td>
                      <td className="p-5">
                        <div className="flex flex-col gap-1">
                          <span className={`w-max px-2.5 py-1 rounded-md text-[10px] uppercase font-black tracking-wider ${report.type.includes('Yangın') ? 'bg-orange-100 text-orange-700' : report.type.includes('Atık') ? 'bg-amber-100 text-amber-700' : 'bg-cyan-100 text-cyan-700'}`}>
                            {report.type}
                          </span>
                          <span className="text-gray-600 font-medium text-xs mt-1">{report.description}</span>
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <MapPin size={14} className="text-gray-400" /> {report.location}
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="flex flex-col">
                          <span className="text-gray-800">{report.user}</span>
                          <span className="text-xs text-gray-400 font-medium">{report.date}</span>
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="flex items-center justify-center gap-2">
                          {report.status === 'pending' ? (
                            <>
                              <button onClick={() => handleApprove(report.id)} className="flex items-center gap-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white px-3 py-2 rounded-xl transition font-bold text-xs shadow-sm">
                                <Check size={16}/> Onayla
                              </button>
                              <button onClick={() => openRejectModal(report.id)} className="flex items-center gap-1.5 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white px-3 py-2 rounded-xl transition font-bold text-xs shadow-sm">
                                <X size={16}/> Reddet
                              </button>
                            </>
                          ) : report.status === 'approved' ? (
                            <span className="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-bold w-max mx-auto"><CheckCircle size={14}/> Onaylandı</span>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <span className="bg-red-100 text-red-700 px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-bold w-max mx-auto"><XCircle size={14}/> Reddedildi</span>
                              {report.rejectReason && <span className="text-[10px] text-gray-500 max-w-[150px] truncate" title={report.rejectReason}>Sebep: {report.rejectReason}</span>}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 2. KULLANICI YÖNETİMİ SEKMESİ */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            
            <div className="flex gap-2">
              <button onClick={()=>setUserFilter('all')} className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm ${userFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Tüm Kullanıcılar</button>
              <button onClick={()=>setUserFilter('active')} className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm ${userFilter === 'active' ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Aktif Olanlar</button>
              <button onClick={()=>setUserFilter('new')} className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm ${userFilter === 'new' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Yeni Kayıtlar</button>
              <button onClick={()=>setUserFilter('banned')} className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm ${userFilter === 'banned' ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Engellenenler</button>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200 text-xs uppercase font-black text-gray-500 tracking-wider">
                    <th className="p-5">Kullanıcı Bilgileri</th>
                    <th className="p-5 text-center">Aktivite</th>
                    <th className="p-5 text-center">Durum</th>
                    <th className="p-5 text-center">Aksiyonlar</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-semibold text-gray-700">
                  {filteredUsers.length > 0 ? filteredUsers.map((user) => (
                    <tr key={user.id} className={`border-b border-gray-100 hover:bg-gray-50/50 transition ${user.status === 'banned' ? 'bg-red-50/30' : ''}`}>
                      <td className="p-5">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-black shadow-sm ${user.status === 'banned' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                            {user.name.charAt(0)}
                          </div>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-900">{user.name}</span>
                              {user.isNew && <span className="bg-blue-100 text-blue-700 text-[9px] px-1.5 py-0.5 rounded-md uppercase font-black">Yeni</span>}
                            </div>
                            <span className="text-xs text-gray-500 font-medium">{user.email}</span>
                            <span className="text-[10px] text-gray-400 mt-0.5">Kayıt: {user.date}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-lg font-black text-gray-800">{user.reports}</span>
                          <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">İhbar</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${user.points >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{user.points} Puan</span>
                        </div>
                      </td>
                      <td className="p-5 text-center">
                        {user.status === 'active' ? (
                          <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-xl text-xs font-bold"><CheckCircle size={14}/> Aktif</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 px-3 py-1.5 rounded-xl text-xs font-bold"><Ban size={14}/> Engelli</span>
                        )}
                      </td>
                      <td className="p-5">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => openMailModal(user.email)} className="bg-white border border-gray-200 text-gray-600 p-2.5 rounded-xl hover:bg-gray-50 hover:text-blue-600 shadow-sm transition" title="Kullanıcıya Özel Mail Gönder">
                            <Mail size={18}/>
                          </button>
                          
                          {user.status === 'active' ? (
                            <button onClick={() => handleToggleBan(user.id, user.status, user.name)} className="bg-white border border-gray-200 text-gray-600 p-2.5 rounded-xl hover:bg-red-50 hover:text-red-600 hover:border-red-200 shadow-sm transition" title="Hesabı Engelle">
                              <Ban size={18}/>
                            </button>
                          ) : (
                            <button onClick={() => handleToggleBan(user.id, user.status, user.name)} className="bg-white border border-gray-200 text-gray-600 p-2.5 rounded-xl hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 shadow-sm transition" title="Engeli Kaldır">
                              <Unlock size={18}/>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan="4" className="p-8 text-center text-gray-500 font-medium">Bu filtreye uygun kullanıcı bulunamadı.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. SİSTEM MESAJLARI SEKMESİ */}
        {activeTab === 'messages' && (
          <div className="grid grid-cols-1 gap-4">
            {messages.length > 0 ? messages.map((msg) => (
              <div key={msg.id} className={`bg-white rounded-3xl p-6 border transition shadow-sm ${!msg.isRead ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200'}`}>
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${!msg.isRead ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                      <MessageSquare size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900">{msg.subject}</h4>
                      <p className="text-xs text-gray-500">{msg.sender} ({msg.email}) • {msg.date}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    
                    {msg.email !== 'system@geomorphosis.com' && (
                      <button 
                        onClick={() => handleReplyMessage(msg.email, msg.subject)} 
                        className="text-xs font-bold bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-200 transition flex items-center gap-1.5"
                        title="Bu Mesaja Cevap Yaz"
                      >
                        <Reply size={14} /> Cevapla
                      </button>
                    )}

                    {!msg.isRead && (
                      <button onClick={() => markAsRead(msg.id)} className="text-xs font-bold bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-200 transition">
                        Okundu İşaretle
                      </button>
                    )}
                    <button onClick={() => deleteMessage(msg.id)} className="text-gray-400 hover:text-red-500 transition p-1" title="Mesajı Sil">
                      <Trash2 size={18}/>
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-700 font-medium bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  {msg.message}
                </p>
              </div>
            )) : (
              <div className="bg-white rounded-3xl p-12 border border-gray-200 text-center flex flex-col items-center shadow-sm">
                <CheckCircle size={48} className="text-gray-300 mb-4" />
                <h3 className="text-lg font-bold text-gray-600">Gelen Kutusu Temiz</h3>
                <p className="text-sm text-gray-400 mt-1">Şu an için okunmamış veya bekleyen bir sistem mesajı bulunmuyor.</p>
              </div>
            )}
          </div>
        )}

        {/* 4. GENEL AYARLAR SEKMESİ */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-8 max-w-3xl">
            <form onSubmit={saveSettings} className="space-y-6">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Sistem Başlığı (Site Adı)</label>
                  <input type="text" value={settings.siteName} onChange={(e)=>setSettings({...settings, siteName: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-800 outline-none focus:border-emerald-500 transition" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Yönetici E-Posta Adresi</label>
                  <input type="email" value={settings.adminEmail} onChange={(e)=>setSettings({...settings, adminEmail: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-800 outline-none focus:border-emerald-500 transition" />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-6 space-y-4">
                <label className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-2xl cursor-pointer hover:bg-gray-100 transition">
                  <div>
                    <h4 className="font-bold text-gray-800 text-sm">Sistem Bakım Modu</h4>
                    <p className="text-xs text-gray-500 mt-0.5">Aktif edildiğinde sistem kilitlenir, sadece yöneticiler giriş yapabilir.</p>
                  </div>
                  <div className={`w-12 h-6 rounded-full p-1 transition-colors ${settings.maintenanceMode ? 'bg-red-500' : 'bg-gray-300'}`} onClick={() => setSettings({...settings, maintenanceMode: !settings.maintenanceMode})}>
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${settings.maintenanceMode ? 'translate-x-6' : 'translate-x-0'}`}></div>
                  </div>
                </label>

                <label className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-2xl cursor-pointer hover:bg-gray-100 transition">
                  <div>
                    <h4 className="font-bold text-gray-800 text-sm">Yeni Kayıtlara İzin Ver</h4>
                    <p className="text-xs text-gray-500 mt-0.5">Kapatılırsa dışarıdan yeni üye kaydı alınamaz.</p>
                  </div>
                  <div className={`w-12 h-6 rounded-full p-1 transition-colors ${settings.allowNewRegistrations ? 'bg-emerald-500' : 'bg-gray-300'}`} onClick={() => setSettings({...settings, allowNewRegistrations: !settings.allowNewRegistrations})}>
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${settings.allowNewRegistrations ? 'translate-x-6' : 'translate-x-0'}`}></div>
                  </div>
                </label>
              </div>

              <div className="pt-4">
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition">
                  <Save size={18} /> Ayarları Kaydet
                </button>
              </div>
            </form>
          </div>
        )}

      </main>

      {/* --- ÖZEL MODALLAR --- */}
      
      {/* 1. İhbar Reddetme Sebebi Modalı */}
      {rejectModal.isOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden p-6 relative">
            <button onClick={() => setRejectModal({isOpen: false, reportId: null, reason: ''})} className="absolute top-4 right-4 text-gray-400 hover:text-red-500 transition"><X size={20}/></button>
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-100 text-red-600 p-3 rounded-2xl"><XCircle size={24}/></div>
              <div>
                <h3 className="text-lg font-black text-gray-900">İhbarı Reddet</h3>
                <p className="text-xs text-gray-500">{rejectModal.reportId} numaralı ihbar için işlem yapılıyor.</p>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Reddedilme Sebebi (Zorunlu)</label>
              <textarea 
                rows="3" 
                value={rejectModal.reason}
                onChange={(e) => setRejectModal({...rejectModal, reason: e.target.value})}
                placeholder="Kullanıcıya iletilecek sebebi buraya yazın..." 
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-red-500 resize-none font-medium"
              ></textarea>
            </div>
            <button onClick={confirmReject} className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold shadow-lg transition">İhbarı Kalıcı Olarak Reddet</button>
          </div>
        </div>
      )}

      {/* 2. Kullanıcıya Özel Mail Gönderme Modalı */}
      {mailModal.isOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden p-6 relative">
            <button onClick={() => setMailModal({isOpen: false, userEmail: '', subject: '', message: ''})} className="absolute top-4 right-4 text-gray-400 hover:text-red-500 transition"><X size={20}/></button>
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-blue-100 text-blue-600 p-3 rounded-2xl"><Mail size={24}/></div>
              <div>
                <h3 className="text-lg font-black text-gray-900">E-Posta Gönder</h3>
                <p className="text-xs text-gray-500">Alıcı: <span className="font-bold text-gray-700">{mailModal.userEmail}</span></p>
              </div>
            </div>
            <form onSubmit={sendMail} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Konu</label>
                <input required value={mailModal.subject} onChange={(e) => setMailModal({...mailModal, subject: e.target.value})} type="text" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-500 font-medium" placeholder="Mesajınızın konusu..." />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Mesajınız</label>
                <textarea required value={mailModal.message} onChange={(e) => setMailModal({...mailModal, message: e.target.value})} rows="5" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-500 font-medium resize-none" placeholder="Kullanıcıya iletmek istediğiniz mesajı buraya yazın..."></textarea>
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-bold shadow-lg transition flex items-center justify-center gap-2">
                <Send size={18}/> Mesajı Gönder
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}