"use client";

import { useState } from 'react';
import { 
  X, 
  Mail, 
  Lock, 
  User, 
  Leaf, 
  ArrowRight, 
  AlertCircle 
} from 'lucide-react';

// SİSTEMİN GERÇEKÇİ ÇALIŞMASI İÇİN SANAL VERİTABANI
let MOCK_USERS = [
  { 
    email: 'seyma@ornek.com', 
    password: 'password123', 
    name: 'Şeyma K.', 
    points: 720, 
    role: 'user', 
    photo: null 
  },
  { 
    email: 'admin@geomorphosis.com', 
    password: '123456', 
    name: 'Sistem Yöneticisi', 
    points: 9999, 
    role: 'admin', 
    photo: null 
  }
];

export default function AuthModal({ isOpen, onClose, onLogin }) {
  const [view, setView] = useState('login'); 
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) {
    return null;
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(''); 

    // E-POSTA FORMAT KONTROLÜ
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Lütfen geçerli bir e-posta formatı giriniz. (Örn: ornek@mail.com)");
      return;
    }

    if (view === 'register') {
      
      const nameTrimmed = name.trim();
      const nameParts = nameTrimmed.split(/\s+/); 
      
      // AD-SOYAD KELİME SAYISI KONTROLÜ
      if (nameParts.length < 2) {
        setError("Lütfen hem adınızı hem de soyadınızı arada boşluk bırakarak tam giriniz.");
        return;
      }

      // AD-SOYAD UZUNLUK KONTROLÜ
      const isAnyPartTooShort = nameParts.some(part => part.length < 2);
      if (isAnyPartTooShort) {
        setError("Ad ve soyadınızdaki her kelime en az 2 harften oluşmalıdır. Kısaltma girmeyiniz.");
        return;
      }

      // AD-SOYAD KARAKTER KONTROLÜ
      const nameRegex = /^[a-zA-ZçÇğĞıİöÖşŞüÜ\s]+$/;
      if (!nameRegex.test(nameTrimmed)) {
        setError("Ad soyad alanı sadece harflerden oluşmalıdır. Rakam veya sembol kullanamazsınız.");
        return;
      }

      // ŞİFRE EŞLEŞME KONTROLÜ
      if (password !== confirmPassword) {
        setError("Girdiğiniz şifreler birbiriyle eşleşmiyor. Lütfen kontrol edip tekrar giriniz.");
        return;
      }
      
      // ŞİFRE UZUNLUK KONTROLÜ
      if (password.length < 6) {
        setError("Güvenliğiniz için şifreniz en az 6 karakter uzunluğunda olmalıdır.");
        return;
      }

      // E-POSTA KULLANIM KONTROLÜ
      const isExist = MOCK_USERS.find(u => u.email === email);
      if (isExist) {
        setError("Bu e-posta adresi zaten kullanımda. Lütfen giriş yapmayı deneyin.");
        return;
      }

      // Kaydet ve giriş yap
      const newUser = { 
        email: email, 
        password: password, 
        name: nameTrimmed, 
        points: 0, 
        role: 'user', 
        photo: null 
      };
      MOCK_USERS.push(newUser);
      
      onLogin({ 
        name: newUser.name, 
        role: newUser.role, 
        points: newUser.points,
        photo: newUser.photo 
      });

    } else if (view === 'login') {
      
      const user = MOCK_USERS.find(u => u.email === email);
      
      if (!user) {
        setError("Sistemde böyle bir kullanıcı bulunamadı. Lütfen kayıt olun.");
        return;
      }

      if (user.password !== password) {
        setError("Hatalı şifre girdiniz. Lütfen tekrar deneyin.");
        return;
      }

      onLogin({ 
        name: user.name, 
        role: user.role, 
        points: user.points,
        photo: user.photo 
      });

      // BURASI ÇOK ÖNEMLİ: Eğer giren kişi adminse otomatik Admin sayfasına fırlat!
      if (user.role === 'admin') {
        window.location.href = '/admin';
      }

    } else if (view === 'forgot') {
      const user = MOCK_USERS.find(u => u.email === email);
      if (!user) {
        setError("Sistemde böyle bir e-posta adresi bulunamadı.");
        return;
      }
      alert("Sıfırlama bağlantısı e-posta adresinize gönderildi!");
      setView('login');
      setError('');
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row relative h-[600px]">
        
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors z-20"
        >
          <X size={20} />
        </button>

        <div className="hidden md:flex md:w-5/12 relative bg-emerald-600 flex-col justify-between p-10 text-white overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1511497584788-876760111969?q=80&w=1000&auto=format&fit=crop')] bg-cover bg-center opacity-30 mix-blend-overlay"></div>
          
          <div className="relative z-10">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6">
              <Leaf size={28} className="text-white" />
            </div>
            <h2 className="text-3xl font-bold leading-tight mb-4">
              Doğayı Koru,<br />Geleceğe İz Bırak.
            </h2>
            <p className="text-emerald-50 text-sm opacity-90 leading-relaxed">
              GeoMorphosis topluluğuna katılarak çevresel sorunları bildirin, puanlar toplayın ve doğanın korunmasına katkı sağlayın.
            </p>
          </div>
        </div>

        <div className="w-full md:w-7/12 p-8 md:p-12 flex flex-col justify-center bg-white overflow-y-auto">
          
          <div className="mb-6">
            <h2 className="text-2xl font-black text-gray-900 mb-2">
              {view === 'login' ? 'Tekrar Hoş Geldiniz' : view === 'register' ? 'Aramıza Katılın' : 'Şifrenizi Mi Unuttunuz?'}
            </h2>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 animate-in slide-in-from-top-2">
              <AlertCircle size={18} className="text-red-600 mt-0.5 shrink-0" />
              <p className="text-xs font-bold text-red-700 leading-tight">
                {error}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {view === 'register' && (
              <div className="relative">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Ad Soyad
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-3.5 text-gray-400" size={18} />
                  <input 
                    type="text" 
                    required 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    placeholder="Örn: Şeyma K." 
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-12 pr-4 text-sm outline-none focus:border-emerald-500 font-medium" 
                  />
                </div>
              </div>
            )}
            
            <div className="relative">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                E-Posta Adresi
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-3.5 text-gray-400" size={18} />
                <input 
                  type="email" 
                  required 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  placeholder="ornek@mail.com" 
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-12 pr-4 text-sm outline-none focus:border-emerald-500 font-medium" 
                />
              </div>
            </div>

            {view !== 'forgot' && (
              <div className="relative">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Şifre
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-3.5 text-gray-400" size={18} />
                  <input 
                    type="password" 
                    required 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    placeholder="••••••••" 
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-12 pr-4 text-sm outline-none focus:border-emerald-500 font-medium" 
                  />
                </div>
                
                {view === 'login' && (
                  <div className="text-right mt-1.5">
                    <button 
                      type="button" 
                      onClick={() => {
                        setView('forgot'); 
                        setError('');
                      }} 
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
                    >
                      Şifremi Unuttum
                    </button>
                  </div>
                )}
              </div>
            )}

            {view === 'register' && (
              <div className="relative">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Şifre Tekrar
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-3.5 text-gray-400" size={18} />
                  <input 
                    type="password" 
                    required 
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)} 
                    placeholder="••••••••" 
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-12 pr-4 text-sm outline-none focus:border-emerald-500 font-medium" 
                  />
                </div>
              </div>
            )}

            <button 
              type="submit" 
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl py-3.5 font-bold transition-all shadow-lg flex items-center justify-center gap-2 mt-4"
            >
              {view === 'login' ? 'Giriş Yap' : view === 'register' ? 'Hesabımı Oluştur' : 'Sıfırlama Bağlantısı Gönder'} 
              <ArrowRight size={18} />
            </button>
          </form>

          <div className="mt-6 text-center">
            {view === 'login' ? (
              <p className="text-sm text-gray-500">
                Hesabınız yok mu? 
                <button 
                  onClick={() => {
                    setView('register'); 
                    setError('');
                  }} 
                  className="font-bold text-emerald-600 underline ml-1"
                >
                  Kayıt Olun
                </button>
              </p>
            ) : (
              <p className="text-sm text-gray-500">
                Zaten hesabınız var mı? 
                <button 
                  onClick={() => {
                    setView('login'); 
                    setError('');
                  }} 
                  className="font-bold text-emerald-600 underline ml-1"
                >
                  Giriş Yapın
                </button>
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}