# One More Step to Finish

Strava koşu verilerinizi, koşu istatistikleri ekranda anlık olarak işlenen **3B dikey video
animasyonuna** dönüştüren tarayıcı uygulaması.

Rota, yükseklik profilinden çıkarılan bir 3B şerit olarak çizilir; kamera koşucuyu takip eder ve
mesafe, süre, tempo, yükseliş, nabız, kadans gibi veriler kare kare hesaplanarak videonun üzerine
işlenir. Sonuç, Reels / TikTok / Shorts için doğrudan yüklenebilecek bir MP4 dosyası olarak
indirilir.

Her şey tarayıcıda çalışır. GPS verisi hiçbir sunucuya gönderilmez.

**Canlı sürüm:** <https://aligokten.github.io/Running-Animation/>

---

## Hızlı başlangıç

```bash
npm install
npm run dev
```

Uygulama açıldığında hazır örnek rota (Belgrad Ormanı’nda ~10,5 km’lik bir koşu) yüklü gelir, yani
hiçbir dosya yüklemeden deneyebilirsiniz.

Üretim derlemesi:

```bash
npm run build     # dist/ klasörüne statik site
npm run preview
```

## Veri kaynakları

| Yöntem | Nasıl |
| --- | --- |
| **GPX / TCX dosyası** | Strava’da aktiviteyi açın → “…” → **Export GPX**. Dosyayı sürükleyip bırakın. |
| **Strava API** | “Strava’ya bağlan” panelinden kendi API uygulamanızla yetkilendirin, aktiviteyi listeden seçin veya numarasıyla getirin. |
| **Örnek rota** | Tek tıkla yüklenen, prosedürel olarak üretilmiş bir koşu. |

Zaman damgası içermeyen dosyalarda (yalnızca rota) tempo 5:30/km varsayılarak hesaplanır ve bu
durum arayüzde belirtilir.

### Strava bağlantısı

1. <https://www.strava.com/settings/api> adresinden kişisel bir API uygulaması oluşturun.
2. **Authorization Callback Domain** alanına uygulamayı çalıştırdığınız alan adını yazın
   (geliştirme için `localhost`).
3. Client ID ve Client Secret değerlerini panele girin ve yetkilendirin.

Bilgiler yalnızca tarayıcınızın `localStorage` alanında saklanır.

Bazı tarayıcılar `oauth/token` isteğini CORS nedeniyle engeller. Bu durumda depoyla gelen küçük
proxy’yi çalıştırın; uygulama otomatik olarak ona düşer:

```bash
npm run strava-proxy
```

Aktivite akışlarını çeken `GET` istekleri CORS’a takılmaz, proxy yalnızca jeton değişimi içindir.

## Tasarım temaları

Tema, ekran düzenini ve sahnenin karakterini belirler:

| Tema | Karakter |
| --- | --- |
| **Pulse** | Kalın rakamlar, parlayan iz, dolu istatistik satırı |
| **Minimal** | İnce tipografi, az veri, rotaya odaklı |
| **Telemetri** | Monospace veri paneli, köşe işaretleri, teknik görünüm |
| **Poster** | Dergi kapağı düzeni, büyük başlık, istatistik ızgarası |
| **Yayın** | Spor yayını alt bantları, kayan split bildirimleri |
| **Zen** | Yalnızca mesafe ve süre |
| **Kronometre** | Dev süre sayacı, altında mesafe ve tempo |
| **Yarış Numarası** | Göğüs numarası kartı ve yanda ilerleyen kilometre listesi |
| **Kart** | Yuvarlak köşeli özet kartı, uygulama paylaşımı görünümü |
| **Retro** | Tarama çizgileri ve kalın gölgeli tipografi |
| **Bant** | Üstte ince künye, altta tek satırlık veri bandı |

## Renk paletleri

Neon Gece, Solar Flare, Aurora, Blueprint, Mono Ink, Gün Batımı, Orman Patikası, Turuncu Klasik,
Gün Işığı (açık tema) ve Sakura. Palet temadan bağımsız seçilir; her tema kendi imza paletiyle
açılır ama istediğiniz kombinasyonu kurabilirsiniz.

## Sahne ve ekran ayarları

- **Kamera:** Sinematik (geniş açılış → takip → kapanışta tüm rota), Takip, Yörünge, Kuş bakışı
- **Hız akışı:** mesafeye göre sabit hız veya gerçek tempoya göre (yokuşta yavaşlayan)
- Yükseklik abartısı, iz kalınlığı, video süresi (8–90 sn), dönüş hızı
- Zemin ızgarası, yükseklik perdesi, kilometre işaretleri, soluk tam rota, parçacıklar
- Başlık/alt başlık metni, birim (km / mil) ve her veri bloğunun açık-kapalı durumu

## Video dışa aktarma

| | |
| --- | --- |
| Çözünürlük | 1080×1920 (9:16), 720×1280, 1080×1350 (4:5), 1080×1080 (1:1) |
| Kare hızı | 24 / 30 / 60 fps |
| Kalite | 4–40 Mbps |
| Biçim | MP4 (H.264) |

Dışa aktarma **kare kare** yapılır: her kare tam çözünürlükte çizilir, WebCodecs `VideoEncoder`
ile açık zaman damgasıyla kodlanır ve MP4 kabına yazılır. Bu sayede çıkan videonun süresi,
bilgisayarınız yavaş olsa bile tam olarak seçtiğiniz süredir.

Tarayıcı H.264 kodlamayı desteklemiyorsa sırasıyla VP9 ve AV1 denenir (yine kare kare, yine MP4).
WebCodecs hiç yoksa `MediaRecorder` ile gerçek zamanlı kayda düşülür ve WebM üretilir; bu durum
arayüzde bildirilir.

“Kareyi PNG indir” düğmesi o anki kareyi tam çözünürlükte durağan görsel olarak verir.

Önizleme, akıcı kalması için küçültülmüş çözünürlükte çizilir; dışa aktarma sırasında aynı çizim
kodu tam çözünürlükte çalışır, dolayısıyla ekranda gördüğünüz kare dosyaya birebir yansır.

## Nasıl çalışıyor

```
src/
  data/        GPX & TCX ayrıştırma, Strava istemcisi, metrik hesapları, örnek rota
  three/       enlem-boylam → dünya koordinatı izdüşümü, GLSL malzemeler, 3B sahne ve kamera
  hud/         2B tuval üzerine çizilen tema bazlı veri katmanı
  render/      3B kareyi ve HUD’u tek tuvalde birleştiren çizici
  export/      WebCodecs / MediaRecorder kaydedici
  themes/      tema ve palet tanımları
  ui/          React arayüzü
server/        Strava jeton değişimi için isteğe bağlı yerel proxy
```

Birkaç ayrıntı:

- **Rota geometrisi.** Noktalar, merkezi başlangıç kabul eden eş dikdörtgen izdüşümle metreye,
  ardından sabit 200 birimlik bir dünyaya ölçeklenir. Yükseklik, rotanın kendi engebesine göre
  abartılır: düz bir şehir turu da bir şekle sahip olur, alp tırmanışı da ekrandan taşmaz.
- **İlerleme.** Şerit ve perde, her köşeye işlenmiş normalize mesafe (`aT`) ile çizilir; GLSL
  tarafında `uProgress` değerini aşan parçalar atılır. Böylece rota, yeniden geometri üretmeden
  kare hassasiyetinde açılır.
- **Belirlenimcilik.** Sahnedeki her şey (kamera salınımı, işaretçi nabzı, parçacık sürüklenmesi)
  yalnızca `(ilerleme, zaman)` ikilisinin fonksiyonudur; kareden kareye biriken durum yoktur.
  Dışa aktarmanın önizlemeyle birebir aynı çıkmasının nedeni budur.
- **Örnekleme.** Aktivite başına tüm arama tabloları bir kez hesaplanır, böylece kare başına
  örnekleme bellek ayırmaz.

## Yayınlama

Varsayılan dala her push’ta `.github/workflows/deploy.yml` derlemeyi çalıştırıp sonucu GitHub
Pages’e gönderir. Derleme `base: './'` ile yapıldığı için site alt yolda
(`/Running-Animation/`) sorunsuz çalışır.

Depoda **bir kez** yapılması gereken ayar: **Settings → Pages → Build and deployment → Source**
seçeneğini *GitHub Actions* yapın. İş akışının jetonu dağıtım yapabiliyor ama Pages sitesini
kendisi oluşturamıyor, bu yüzden ilk açma elle yapılıyor. Sonrasında her push otomatik yayınlanır.

Kendi hesabınızda yayınlamak isterseniz depoyu çatallayıp workflow’daki dal adını kendi
varsayılan dalınızla değiştirin.

Strava’yı yayınlanmış sürümde kullanacaksanız Strava API uygulamanızın **Authorization Callback
Domain** alanına sitenin alan adını (örn. `aligokten.github.io`) eklemeyi unutmayın.

## Gereksinimler

Modern bir masaüstü tarayıcısı. En iyi sonuç için Chrome veya Edge: WebCodecs ile kare kare MP4
dışa aktarma bu tarayıcılarda çalışır. Safari ve Firefox’ta önizleme sorunsuzdur, dışa aktarma
gerçek zamanlı kayda düşebilir.
