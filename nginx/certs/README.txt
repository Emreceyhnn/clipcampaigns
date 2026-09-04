Cloudflare Origin Certificate buraya:

1. Cloudflare Dashboard -> SSL/TLS -> Origin Server -> Create Certificate
   - Key type: RSA (2048) yeterli
   - Hostnames: clipcampaigns.emreceyhan.xyz, *.clipcampaigns.emreceyhan.xyz
   - Geçerlilik: 15 yıl seçilebilir
2. Cloudflare sana iki blok verir:
   - Origin Certificate  -> bu klasöre "cert.pem" olarak kaydet
   - Private Key         -> bu klasöre "key.pem" olarak kaydet
3. Cloudflare Dashboard -> SSL/TLS -> Overview -> mod "Full (strict)" yap.
4. docker compose restart nginx

Bu iki dosya (cert.pem, key.pem) .gitignore'a eklenmeli, repoya commitlenmemeli.
