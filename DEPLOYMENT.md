# Ücretsiz güvenli yayın

Bu proje GitHub kaynak kodu + Cloudflare Workers/D1 için hazırlanmıştır. GitHub Pages yalnızca statik dosya yayımlar; giriş ve ortak müşteri kayıtlarını koruyamaz.

## Kullanıcı güvenliği

- `SESSION_SECRET` yalnızca Cloudflare secret olarak tanımlanır.
- İlk yönetici hesabı, D1 veritabanına güvenli parola özetiyle eklenir.
- Kullanıcı ekleme API'sini yalnızca yönetici kullanabilir.
- Gerçek müşteri kayıtları hiçbir zaman Git'e eklenmez.

## Kurulumda gerekli değerler

1. Ücretsiz Cloudflare hesabı ve bir D1 veritabanı oluşturun.
2. D1 kimliğini `wrangler.toml` içindeki `YOUR_D1_DATABASE_ID` ile değiştirin.
3. `schema.sql` dosyasını D1 üzerinde çalıştırın.
4. Cloudflare'da `SESSION_SECRET` değerini secret olarak tanımlayın.
5. GitHub deposunu Cloudflare Workers ile bağlayarak `main` dalında otomatik yayın açın.

Bu adımlar kullanıcı hesabı ve secret oluşturduğu için eczane sahibi tarafından Cloudflare panelinde tamamlanmalıdır.

