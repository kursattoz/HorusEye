# PRD-001 — Auth & Kullanıcı Yönetimi
**Versiyon:** 1.0  
**Sahibi:** HorusEye Ekibi  
**Bağımlılıklar:** PRD-000  
**Bloke ettiği:** PRD-002, PRD-003, PRD-004, PRD-007  
**Durum:** AKTIF

---

<!-- INTERFACE_DEPS
AuthUser: @1.0
-->

## ⚠️ LLM TALİMATI
Bu PRD'yi değiştirirken PRD-000 Section 3.1 (AuthUser interface) değişmeden kalmalı.
UserRole enum'u değiştirilecekse önce PRD-000 güncellenip onay alınmalı.
Interface bağımlılıkları INTERFACE_DEPS bloğunda declare edilmiştir.
PRD-000'daki version değişirse bu bloğu güncelle, yoksa `validate:prd` script'i fail eder.

---

## 1. Amaç

HorusEye'ın tüm kullanıcı kimlik doğrulama ve yetki yönetimi altyapısını kurmak.
Multi-role sistem: admin, supervisor, assistant, guest (PRD-000 SYSTEM_GLOSSARY.UserRole).

**Kritik Kural:** Guest rolü hiçbir zaman hesap sahibi olamaz. URL ile erişir, sisteme kayıt olamaz.
Supervisor ve Assistant hesapları sadece Admin tarafından açılır.

---

## 2. Kullanıcı Senaryoları

**S1 — Admin login:**  
Admin, email + şifre ile giriş yapar. Dashboard'a yönlendirilir. Tüm modüllere erişir.

**S2 — Supervisor login:**  
Hoca, Admin'in oluşturduğu hesapla giriş yapar. Sadece dosya görüntüleme ve feedback modüllerine erişir. Dashboard'da dosya yönetimi ve takım yönetimi görünmez.

**S3 — Assistant login:**  
Asistan, Admin'in oluşturduğu hesapla giriş yapar. Sadece dosyaları görüntüleyebilir. Feedback yazamaz.

**S4 — Guest erişimi:**  
Login gerektirmez. Ana sayfanın sol panelindeki public dokümanlar direkt URL ile erişilebilir.
Herhangi bir protected route'a gitmeye çalışırsa `/login`'e yönlendirilir, hesap oluşturma seçeneği gösterilmez.

**S5 — Şifre sıfırlama:**  
Sadece Admin ve mevcut yetkili kullanıcılar için. Magic link email ile şifre sıfırlanır.

**S6 — Admin kullanıcı oluşturma:**  
Admin, dashboard'dan yeni Supervisor/Assistant hesabı oluşturur. Sistem otomatik welcome email gönderir.

---

## 3. Fonksiyonel Gereksinimler

### 3.1 Login Sayfası (`/login`)
- Email + şifre formu
- "Şifremi unuttum" linki
- Kayıt ol seçeneği YOK (guest bunu görse bile hesap açamaz)
- Login başarısız olursa: spesifik hata mesajı (yanlış şifre vs hesap yok ayrımı yapma — güvenlik)
- 5 başarısız denemede 15 dakika kilitleme (rate limiting)
- Başarılı login sonrası: role göre yönlendirme
  - admin → `/dashboard`
  - supervisor → `/dashboard/feedback`
  - assistant → `/dashboard/feedback`

### 3.2 Session Yönetimi
- Supabase Auth JWT kullan
- Token refresh: otomatik, kullanıcı fark etmez
- Session süresi: 7 gün (remember me default açık)
- Farklı cihazlarda oturum: izin verilir, max 5 aktif oturum
- Logout: tüm cihazlardan çıkış seçeneği sunulur

### 3.3 Rol Tabanlı Erişim (RBAC)

| Route | admin | supervisor | assistant | guest |
|-------|-------|-----------|-----------|-------|
| `/` | ✓ | ✓ | ✓ | ✓ |
| `/docs/[slug]` | ✓ | ✓ | ✓ | ✓ |
| `/login` | redirect dashboard | ✓ | ✓ | ✓ |
| `/dashboard` | ✓ | ✓ | ✓ | ✗ |
| `/dashboard/files` | ✓ | ✗ | ✗ | ✗ |
| `/dashboard/team` | ✓ | ✗ | ✗ | ✗ |
| `/dashboard/feedback` | ✓ | ✓ | ✓ | ✗ |
| `/dev/monitor` | ✓ | ✗ | ✗ | ✗ |

### 3.4 Kullanıcı Yönetimi (Admin Paneli)
- Kullanıcı listesi: tablo görünümü, rol filtresi, arama
- Yeni kullanıcı oluştur: email, rol seç (supervisor/assistant), welcome email gönder
- Kullanıcı düzenle: rol değiştir, aktif/pasif et
- Kullanıcı sil: soft delete (audit log için kayıt kalır)
- Şifre sıfırlama emaili gönder

### 3.5 Profil Sayfası
- Email görüntüle (değiştirilemez, admin değiştirir)
- Şifre değiştir
- Aktif oturumları görüntüle ve sonlandır

---

## 4. Non-Fonksiyonel Gereksinimler

- Login response süresi: < 500ms
- Rate limiting: 5 deneme / 15 dakika / IP
- Şifreler: Supabase Auth tarafından bcrypt ile hash'lenir
- JWT: RS256, 1 saatlik access token, 7 günlük refresh token
- HTTPS zorunlu (Vercel default)

---

## 5. Veritabanı

### 5.1 Migration SQL

```sql
-- user_profiles tablosu (auth.users extend)
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(100),
  role VARCHAR(20) NOT NULL DEFAULT 'assistant'
    CHECK (role IN ('admin', 'supervisor', 'assistant')),
    -- NOT: 'guest' DB'ye yazılmaz, sadece uygulama mantığında var
  team_id VARCHAR(50) DEFAULT 'horuseye-team',
  is_active BOOLEAN DEFAULT true,
  avatar_url TEXT,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL  -- Soft delete
);

-- RLS Policies
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Admin her şeyi görür
CREATE POLICY "admin_full_access" ON public.user_profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Kullanıcı sadece kendi profilini görür
CREATE POLICY "user_own_profile" ON public.user_profiles
  FOR SELECT USING (id = auth.uid());

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
```

---

## 6. API Routes

```
POST /api/auth/login          → Supabase signInWithPassword
POST /api/auth/logout         → Supabase signOut
POST /api/auth/reset-password → Magic link gönder
GET  /api/auth/me             → Mevcut kullanıcı bilgisi

GET    /api/users             → Kullanıcı listesi (admin only)
POST   /api/users             → Yeni kullanıcı oluştur (admin only)
PUT    /api/users/[id]        → Kullanıcı güncelle (admin only)
DELETE /api/users/[id]        → Soft delete (admin only)
POST   /api/users/[id]/reset  → Şifre reset emaili gönder (admin only)
```

---

## 7. Hata Yönetimi (PRD-006 ile entegre)

Her auth işleminde aşağıdakiler loglanır (PRD-000 LogEventType):

| Olay | LogEventType | Severity |
|------|-------------|----------|
| Başarılı login | auth.login | info |
| Başarısız login | auth.failed | warn |
| Logout | auth.logout | info |
| Rate limit aşımı | auth.failed | error |
| Şifre sıfırlama | auth.password_reset | info |
| Yetkisiz erişim denemesi | system.warning | warn |

**Frontend hata gösterimi:**
- Login hatası: toast notification, kırmızı
- Session süresi dolarsa: modal "Oturumunuz sona erdi, tekrar giriş yapın"
- Rate limit: "Çok fazla deneme. 15 dakika sonra tekrar deneyin."
- Sunucu hatası: "Bir sorun oluştu. Lütfen daha sonra tekrar deneyin." + Sentry'e rapor

---

## 8. UI Bileşenleri

```
/components/auth/
├── LoginForm.tsx         → Email + şifre, validation, error states
├── ResetPasswordForm.tsx → Email formu
├── UserTable.tsx         → Admin kullanıcı listesi
├── CreateUserModal.tsx   → Yeni kullanıcı oluşturma
└── SessionList.tsx       → Aktif oturumlar

/middleware.ts             → Route protection, role check
/lib/auth/
├── server.ts             → Server-side Supabase client
├── client.ts             → Client-side Supabase client
└── guards.ts             → requireRole() helper
```

---

## 9. Middleware Mantığı

```typescript
// middleware.ts — pseudocode
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await getSession(request);

  // Public routes — herkes erişir
  const publicRoutes = ['/', '/login', '/docs'];
  if (publicRoutes.some(r => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  // Protected routes — login zorunlu
  if (!session) {
    return NextResponse.redirect('/login');
  }

  // Admin-only routes
  const adminRoutes = ['/dashboard/files', '/dashboard/team', '/dev'];
  if (adminRoutes.some(r => pathname.startsWith(r))) {
    if (session.user.role !== 'admin') {
      return NextResponse.redirect('/dashboard');
    }
  }

  // Her protected route erişimini logla (PRD-006)
  await logPageVisit(session.user.id, pathname);

  return NextResponse.next();
}
```

---

## 10. Breaking Changes Geçmişi

| Tarih | Değişiklik | Etkilenen PRD |
|-------|-----------|---------------|
| v1.0 | İlk versiyon | — |

---

## 11. Test Senaryoları

- [ ] Admin login → dashboard'a yönlendirilir
- [ ] Supervisor login → /dashboard/feedback'e yönlendirilir
- [ ] Guest /dashboard'a gitmeye çalışır → /login'e yönlendirilir
- [ ] 5 başarısız login → rate limit aktif
- [ ] Admin supervisor hesabı oluşturur → welcome email gider
- [ ] Supervisor /dashboard/files'a girer → 403, dashboard'a yönlendirilir
- [ ] Session süresi dolar → modal gösterilir
