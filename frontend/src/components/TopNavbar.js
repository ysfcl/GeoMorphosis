"use client";

import { useState, useRef, useEffect } from 'react';
import { 
  LogOut, 
  Settings, 
  ChevronDown, 
  User, 
  AlertTriangle, 
  Leaf, 
  Camera, 
  XCircle, 
  ShieldCheck,
  Trash2,
  CheckCircle
} from 'lucide-react';

export default function TopNavbar({ user, onOpenAuth, onLogout, onOpenReport }) {
  const [profileDropdown, setProfileDropdown] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // FOTOĞRAF YÜKLEME VE ÖNİZLEME STATE'LERİ
  const [photoPreview, setPhotoPreview] = useState(null);
  const fileInputRef = useRef(null);

  // BİLDİRİM (TOAST) STATE'İ
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Bildirim Gösterme Fonksiyonu
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'success' });
    }, 3000);
  };

  // Ayarlar modalı açıldığında, kullanıcının mevcut fotoğrafını önizlemeye al
  const handleOpenSettings = () => {
    setPhotoPreview(user?.photo || null);
    setIsSettingsOpen(true);
    setProfileDropdown(false);
  };

  // Bilgisayardan dosya seçildiğinde çalışır
  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const isUpdate = !!photoPreview; // Eğer önceden fotoğraf varsa değiştirildi mesajı vereceğiz
        setPhotoPreview(reader.result);
        if (isUpdate) {
          showToast('Fotoğraf başarıyla değiştirildi.', 'success');
        } else {
          showToast('Fotoğraf başarıyla eklendi.', 'success');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Fotoğrafı kaldırma işlemi
  const handleRemovePhoto = () => {
    setPhotoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    showToast('Fotoğraf başarıyla kaldırıldı.', 'error');
  };

  // Ayarları Kaydetme İşlemi
  const handleSaveSettings = () => {
    showToast('Profil ayarları başarıyla güncellendi.', 'success');
    // Bildirimi görmesi için 1.5 saniye sonra pencereyi kapat
    setTimeout(() => {
      setIsSettingsOpen(false);
    }, 1500);
  };

  return (
    <>
      <nav className="absolute top-0 left-0 right-0 z-[1000] h-20 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl shadow-sm border-b border-white/20 transition-colors duration-300">
        <div className="h-full px-4 sm:px-8 flex items-center justify-between max-w-7xl mx-auto">
          
          <div 
            className="flex items-center gap-3 cursor-pointer" 
            onClick={() => window.location.href = '/'}
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Leaf className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black bg-gradient-to-r from-emerald-700 to-teal-600 bg-clip-text text-transparent tracking-tight">
                GeoMorphosis
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <button 
              onClick={onOpenReport}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-red-600/30 transition-all flex items-center gap-2"
            >
              <AlertTriangle size={18} /> 
              <span className="hidden sm:inline">İhbar Yap</span>
            </button>

            {!user ? (
              <button 
                onClick={onOpenAuth}
                className="flex items-center gap-2 text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 px-5 py-2.5 rounded-xl shadow-md transition-all"
              >
                <User size={18} /> Giriş Yap
              </button>
            ) : (
              <div className="relative">
                <button 
                  onClick={() => setProfileDropdown(!profileDropdown)}
                  className="flex items-center gap-2 p-1.5 pr-3 rounded-xl bg-white shadow-sm border border-gray-100 transition"
                >
                  {user.photo ? (
                    <img 
                      src={user.photo} 
                      alt="Profil" 
                      className="w-9 h-9 rounded-lg object-cover" 
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 text-white font-black flex items-center justify-center">
                      {user.name.charAt(0)}
                    </div>
                  )}
                  
                  <div className="text-left hidden md:block">
                    <p className="text-xs font-bold text-gray-900">
                      {user.name}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {user.role === 'admin' ? 'Yönetici' : `${user.points} Puan`}
                    </p>
                  </div>
                  <ChevronDown size={14} className="text-gray-500 ml-1" />
                </button>

                {profileDropdown && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                    <div className="p-2 space-y-1">
                      
                      {/* EĞER KULLANICI ADMİN İSE ADMİN PANELİ BUTONU ÇIKAR */}
                      {user.role === 'admin' && (
                        <button 
                          onClick={() => window.location.href = '/admin'} 
                          className="w-full flex items-center gap-3 px-3 py-2 text-sm font-bold text-blue-600 hover:bg-blue-50 rounded-xl"
                        >
                          <ShieldCheck size={16} /> Admin Paneli
                        </button>
                      )}
                      
                      <button 
                        onClick={handleOpenSettings} 
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 rounded-xl"
                      >
                        <Settings size={16} /> Profil ve Ayarlar
                      </button>
                      
                      <button 
                        onClick={() => { 
                          onLogout(); 
                          setProfileDropdown(false); 
                        }} 
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-xl"
                      >
                        <LogOut size={16} /> Çıkış Yap
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* PROFIL VE AYARLAR MODALI */}
      {isSettingsOpen && user && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-200">
          
          {/* ÖZEL SAĞ ALT BİLDİRİM (TOAST) KUTUSU SADECE MODAL AÇIKKEN GÖRÜNSÜN */}
          <div className={`fixed bottom-6 right-6 z-[99999] transition-all duration-300 transform ${toast.show ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'}`}>
            <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl border ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
              {toast.type === 'success' ? <CheckCircle size={20} className="text-emerald-500" /> : <AlertTriangle size={20} className="text-red-500" />}
              <span className="text-sm font-bold">{toast.message}</span>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative flex flex-col">
            
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h2 className="text-xl font-black text-gray-900">
                Profil Ayarları
              </h2>
              <button 
                onClick={() => setIsSettingsOpen(false)} 
                className="p-2 hover:bg-red-100 text-gray-500 hover:text-red-500 rounded-full transition"
              >
                <XCircle size={24} />
              </button>
            </div>
            
            <div className="p-6 space-y-5">
              
              {/* ÇALIŞAN FOTOĞRAF YÜKLEME ALANI */}
              <div className="flex flex-col items-center">
                
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  ref={fileInputRef} 
                  onChange={handlePhotoChange} 
                />

                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="relative w-24 h-24 rounded-full bg-gray-100 border-4 border-white shadow-lg flex items-center justify-center overflow-hidden mb-3 group cursor-pointer"
                >
                  {photoPreview ? (
                    <img src={photoPreview} className="w-full h-full object-cover" alt="Profil Önizleme" />
                  ) : (
                    <User size={40} className="text-gray-400" />
                  )}
                  
                  {/* Üzerine gelince çıkan kamera ikonu */}
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="text-white" size={24} />
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline transition-colors"
                  >
                    {photoPreview ? 'Fotoğrafı Değiştir' : 'Fotoğraf Ekle'}
                  </button>
                  
                  {photoPreview && (
                    <button 
                      type="button"
                      onClick={handleRemovePhoto}
                      className="text-xs font-bold text-red-500 hover:text-red-600 hover:underline transition-colors flex items-center gap-1"
                    >
                      <Trash2 size={12} /> Kaldır
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Ad Soyad
                </label>
                <input 
                  type="text" 
                  defaultValue={user.name} 
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-700 outline-none focus:border-emerald-500" 
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  E-Posta (Değiştirilemez)
                </label>
                <input 
                  type="email" 
                  disabled 
                  defaultValue={user.email || "ornek@mail.com"} 
                  className="w-full bg-gray-100 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-500 outline-none cursor-not-allowed" 
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Yeni Şifre
                </label>
                <input 
                  type="password" 
                  placeholder="Yeni şifre belirlemek için yazın..." 
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-700 outline-none focus:border-emerald-500" 
                />
              </div>
              
              <button 
                onClick={handleSaveSettings} 
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3.5 font-bold shadow-lg transition mt-4"
              >
                Değişiklikleri Kaydet
              </button>

            </div>
          </div>
        </div>
      )}
    </>
  );
}