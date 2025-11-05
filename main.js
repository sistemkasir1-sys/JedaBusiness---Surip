/***************************************
 * main.js - POS Cafe (Firebase Realtime)
 * Ganti placeholder FIREBASE_CONFIG, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 ***************************************/

/* ============ CONFIG ============ */
const FIREBASE_CONFIG = {
  // <-- ganti dengan config Firebase kamu
  apiKey: "APIKEY",
  authDomain: "PROJECT.firebaseapp.com",
  databaseURL: "https://PROJECT-default-rtdb.firebaseio.com",
  projectId: "PROJECT",
  appId: "1:...:web:..."
};

const TELEGRAM_BOT_TOKEN = "REPLACE_BOT_TOKEN"; // RISIKO: jangan publish token di repo publik
const TELEGRAM_CHAT_ID = "REPLACE_CHAT_ID";

/* ============ INIT FIREBASE ============ */
firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db = firebase.database();

/* ============ HELPERS ============ */
const $ = id => document.getElementById(id);
const rupiah = n => 'Rp' + (Number(n)||0).toLocaleString('id-ID');

/* ============ UI ELEMENTS ============ */
const loginPage = $('loginPage'), adminPage = $('adminPage'), kasirPage = $('kasirPage');
const btnLogin = $('btnLogin'), emailIn = $('email'), passIn = $('password'), loginMsg = $('loginMsg');
const btnLogout = $('btnLogout'), btnLogout2 = $('btnLogout2');
const pendapatanKotorEl = $('pendapatanKotor'), totalModalEl = $('totalModal'), labaKotorEl = $('labaKotor'), biayaOperasionalEl = $('biayaOperasional'), labaBersihEl = $('labaBersih');
const bahanList = $('bahanList'), produkList = $('produkList'), produkForKasir = $('produkForKasir'), riwayatKasir = $('riwayatKasir'), riwayatAdmin = $('riwayatAdmin');
const btnTambahBahan = $('btnTambahBahan'), btnTambahProduk = $('btnTambahProduk'), btnTambahOp = $('btnTambahOp');
const btnBayar = $('btnBayar'), cartList = $('cartList'), totalBayarEl = $('totalBayar'), metodeBayar = $('metodeBayar'), qrisControls = $('qrisControls'), filePhoto = $('filePhoto'), btnAmbilFoto = $('btnAmbilFoto');
const modal = $('modal'), modalBody = $('modalBody'), modalClose = $('modalClose');
const kasirNameEl = $('kasirName');

/* ============ STATE ============ */
let currentUser = null;
let currentRole = null; // "admin" atau "kasir"
let bahanData = {}, produkData = {}, operasionalData = {}, transaksiData = {};
let cart = []; // {produkId, qty}

/* ============ AUTH ============ */
btnLogin.addEventListener('click', async () => {
  try {
    loginMsg.textContent = 'Sedang login...';
    const res = await auth.signInWithEmailAndPassword(emailIn.value, passIn.value);
    loginMsg.textContent = '';
  } catch (err) {
    loginMsg.textContent = 'Login gagal: ' + err.message;
  }
});

btnLogout.addEventListener('click', ()=> auth.signOut());
btnLogout2.addEventListener('click', ()=> auth.signOut());

auth.onAuthStateChanged(async user => {
  if (!user) {
    // show login
    currentUser = null; currentRole = null;
    showPage('login');
    return;
  }
  currentUser = user;
  // load role from /users/{uid}
  const snap = await db.ref('users/' + user.uid).get();
  const userProfile = snap.exists() ? snap.val() : null;
  if (!userProfile) {
    // default to kasir (or block)
    currentRole = 'kasir';
    await db.ref('users/' + user.uid).set({nama: user.email.split('@')[0], role: 'kasir'});
  } else currentRole = userProfile.role || 'kasir';
  if (currentRole === 'admin') showPage('admin');
  else showPage('kasir');
  kasirNameEl.textContent = userProfile?.nama || user.email;
  // init listeners
  startRealtimeListeners();
});

/* ============ PAGE CONTROL ============ */
function showPage(p) {
  loginPage.classList.add('hidden');
  adminPage.classList.add('hidden');
  kasirPage.classList.add('hidden');
  if (p === 'login') loginPage.classList.remove('hidden');
  if (p === 'admin') adminPage.classList.remove('hidden');
  if (p === 'kasir') kasirPage.classList.remove('hidden');
}

/* ============ REALTIME LISTENERS ============ */
function startRealtimeListeners(){
  // bahan
  db.ref('bahan').on('value', snap => {
    bahanData = snap.val() || {};
    renderBahan();
  });
  // produk
  db.ref('produk').on('value', snap => {
    produkData = snap.val() || {};
    renderProduk();
    renderProdukForKasir();
  });
  // operasional
  db.ref('operasional').on('value', snap => {
    operasionalData = snap.val() || {};
    renderOperasional();
    calcSummary();
  });
  // transaksi
  db.ref('transaksi').on('value', snap => {
    transaksiData = snap.val() || {};
    renderRiwayat();
    calcSummary();
  });
}

/* ============ RENDER FUNCTIONS ============ */
function renderBahan(){
  bahanList.innerHTML = '';
  for(const k in bahanData){
    const b = bahanData[k];
    const row = document.createElement('div');
    row.className='rowItem';
    row.innerHTML = `<div>${k} • ${b.satuan || ''}</div><div>${rupiah(b.harga_beli)} • stok:${b.stok}</div>`;
    bahanList.appendChild(row);
  }
}

function renderProduk(){
  produkList.innerHTML='';
  for(const id in produkData){
    const p=produkData[id];
    const div = document.createElement('div'); div.className='prod';
    div.innerHTML = `<div><strong>${p.nama}</strong><div class="muted">Rp${p.harga_jual}</div></div>
      <div>
        <button onclick="editProduk('${id}')">Edit</button>
        <button onclick="deleteProduk('${id}')">Hapus</button>
      </div>`;
    produkList.appendChild(div);
  }
}

function renderProdukForKasir(){
  produkForKasir.innerHTML='';
  for(const id in produkData){
    const p = produkData[id];
    const div = document.createElement('div'); div.className='prod';
    div.innerHTML = `<div><strong>${p.nama}</strong><div class="muted">Rp${p.harga_jual}</div></div>
      <div><button onclick="addToCart('${id}')">+</button></div>`;
    produkForKasir.appendChild(div);
  }
}

function renderOperasional(){
  const container = $('operasionalList');
  container.innerHTML='';
  for(const id in operasionalData){
    const o = operasionalData[id];
    const el = document.createElement('div'); el.className='rowItem';
    el.innerHTML = `<div>${o.jenis} <small class="muted">${o.tanggal||''}</small></div><div>${rupiah(o.biaya)}</div>`;
    container.appendChild(el);
  }
}

function renderRiwayat(){
  // admin view
  riwayatAdmin.innerHTML='';
  riwayatKasir.innerHTML='';
  for(const trxId in transaksiData){
    const t = transaksiData[trxId];
    const row = makeTransactionRow(trxId, t);
    riwayatAdmin.appendChild(row.cloneNode(true));
    // kasir: filter by uid or nama
    if (currentUser && (t.kasirUid === currentUser.uid || t.kasir === (currentUser.displayName || currentUser.email.split('@')[0]))) {
      riwayatKasir.appendChild(makeTransactionRow(trxId, t));
    }
  }
}

function makeTransactionRow(trxId, t){
  const el = document.createElement('div'); el.className='rowItem';
  const date = new Date(t.waktu).toLocaleString();
  const produkText = (t.produk || '') + (t.qty ? ' x'+t.qty : '');
  let btnView = '';
  if (t.metode === 'QRIS' && t.telegram_photo && t.telegram_photo.file_id) {
    btnView = `<button onclick="viewBukti('${trxId}')">Lihat Bukti Pembayaran</button>`;
  }
  el.innerHTML = `<div><strong>${trxId}</strong><div class="muted">${date} • ${t.kasir||''}</div><div class="muted">${produkText}</div></div>
    <div style="text-align:right">
      <div>${rupiah(t.total)}</div>
      <div class="muted">HPP:${rupiah(t.hpp||0)}</div>
      ${btnView}
    </div>`;
  return el;
}

/* ============ CRUD: BAHAN & PRODUK & OP ============ */
$('btnTambahBahan').addEventListener('click', async ()=>{
  const id = $('bahanName').value.trim();
  if(!id) return alert('Isi nama bahan (id)');
  const obj = {
    harga_beli: Number($('bahanHarga').value)||0,
    stok: Number($('bahanStok').value)||0,
    satuan: $('bahanSatuan').value || 'pcs'
  };
  await db.ref('bahan/'+id).set(obj);
  $('bahanName').value=''; $('bahanHarga').value=''; $('bahanStok').value=''; $('bahanSatuan').value='';
});

$('btnTambahProduk').addEventListener('click', async ()=>{
  const id = $('produkId').value.trim();
  if(!id) return alert('Isi produk_id');
  const obj = {
    nama: $('produkNama').value || id,
    harga_jual: Number($('produkHarga').value)||0,
    resep: {}
  };
  try {
    obj.resep = JSON.parse($('produkResep').value || '{}');
  } catch(e){ return alert('Resep harus JSON valid'); }
  await db.ref('produk/'+id).set(obj);
  $('produkId').value=''; $('produkNama').value=''; $('produkHarga').value=''; $('produkResep').value='';
});

$('btnTambahOp').addEventListener('click', async ()=>{
  const id = db.ref('operasional').push().key;
  const obj = { jenis: $('opJenis').value||'Operasional', biaya: Number($('opBiaya').value)||0, tanggal: $('opTanggal').value||new Date().toISOString().slice(0,10) };
  await db.ref('operasional/'+id).set(obj);
  $('opJenis').value=''; $('opBiaya').value=''; $('opTanggal').value='';
});

/* ============ CART & TRANSAKSI ============ */
function addToCart(produkId){
  const existing = cart.find(c => c.produkId === produkId);
  if(existing) existing.qty += 1; else cart.push({produkId, qty:1});
  renderCart();
}

function renderCart(){
  cartList.innerHTML='';
  let total=0;
  cart.forEach((c, idx) => {
    const p = produkData[c.produkId];
    if(!p) return;
    const subtotal = (p.harga_jual || 0) * c.qty;
    total += subtotal;
    const div = document.createElement('div'); div.className='rowItem';
    div.innerHTML = `<div>${p.nama} <small class="muted">x${c.qty}</small></div>
      <div>
        <button onclick="changeQty(${idx},-1)">-</button>
        <button onclick="changeQty(${idx},1)">+</button>
        <button onclick="removeCart(${idx})">Hapus</button>
        <div>${rupiah(subtotal)}</div>
      </div>`;
    cartList.appendChild(div);
  });
  totalBayarEl.textContent = rupiah(total);
}

function changeQty(i, delta){ cart[i].qty += delta; if(cart[i].qty<=0) cart.splice(i,1); renderCart(); }
function removeCart(i){ cart.splice(i,1); renderCart(); }

metodeBayar.addEventListener('change', ()=> {
  if (metodeBayar.value === 'QRIS') qrisControls.classList.remove('hidden');
  else qrisControls.classList.add('hidden');
});

/* ambil foto dari input file */
btnAmbilFoto.addEventListener('click', ()=> filePhoto.click());

/* proses transaksi & kirim ke Telegram jika QRIS */
btnBayar.addEventListener('click', async ()=>{
  if(cart.length===0) return alert('Keranjang kosong');
  const metode = metodeBayar.value;
  const pelanggan = prompt('Nama pelanggan (opsional)') || '';
  // hitung total, hpp, laba dan resep usage
  let total=0, totalHpp=0, resepUsage = {};
  for(const c of cart){
    const p = produkData[c.produkId];
    if(!p) continue;
    total += (p.harga_jual||0) * c.qty;
    // hitung HPP dari resep
    if(p.resep){
      for(const bahanId in p.resep){
        const jumlahPerPcs = Number(p.resep[bahanId] || 0);
        const totalUse = jumlahPerPcs * c.qty;
        resepUsage[bahanId] = (resepUsage[bahanId]||0) + totalUse;
      }
    }
  }
  // hitung biaya per bahan
  for(const bahanId in resepUsage){
    const b = bahanData[bahanId];
    if(!b || !b.stok) continue;
    const unitCost = Number(b.harga_beli)/Number(b.stok);
    const part = unitCost * resepUsage[bahanId];
    totalHpp += part;
  }
  const laba = total - totalHpp;
  // buat id trx
  const trxId = 'TRX' + Date.now();
  const trxObj = {
    pelanggan,
    produk: cart.map(c=> produkData[c.produkId]?.nama || c.produkId).join(', '),
    qty: cart.reduce((s,c)=>s+c.qty,0),
    total,
    hpp: Math.round(totalHpp),
    laba: Math.round(laba),
    metode,
    kasir: (currentUser.displayName || currentUser.email.split('@')[0]),
    kasirUid: currentUser.uid,
    waktu: new Date().toISOString()
  };

  // jika metode QRIS dan ada file, kirim foto dulu
  if(metode === 'QRIS'){
    const file = filePhoto.files[0];
    if(!file) {
      if(!confirm('Tidak ada foto bukti. Lanjutkan tanpa foto?')) return;
    } else {
      try {
        const telegramRes = await sendPhotoToTelegram(file, `☕ Bukti Pembayaran QRIS\nID Transaksi: #${trxId}\nKasir: ${trxObj.kasir}\nTotal: ${rupiah(total)}\nWaktu: ${new Date().toLocaleString()}`);
        // telegramRes adalah object hasil sendPhoto
        // simpan metadata
        trxObj.telegram_photo = {
          file_id: telegramRes.photo_file_id || telegramRes.result?.photo?.[telegramRes.result.photo.length-1]?.file_id || telegramRes.result?.photo?.[0]?.file_id,
          file_unique_id: telegramRes.result?.photo?.[0]?.file_unique_id || '',
          date: new Date().toISOString(),
          caption: telegramRes.caption || ''
        };
        // optionally: if telegramRes contains file_path, build file_url and store
        if (telegramRes.result && telegramRes.result.photo) {
          // we will fetch file_id later to get file_path when viewing
        }
      } catch(e){
        console.error('Kirim foto ke Telegram gagal', e);
        alert('Gagal mengirim foto ke Telegram: ' + e.message);
      }
    }
  }

  // simpan transaksi di DB
  await db.ref('transaksi/' + trxId).set(trxObj);

  // reduce stok bahan
  const updates = {};
  for(const bahanId in resepUsage){
    const current = bahanData[bahanId];
    if(!current) continue;
    updates[`bahan/${bahanId}/stok`] = (Number(current.stok) - Number(resepUsage[bahanId]));
  }
  await db.ref().update(updates);

  // clear cart and inputs
  cart = []; renderCart(); filePhoto.value='';
  alert('Transaksi disimpan! ID: ' + trxId);
});

/* ============ TELEGRAM: sendPhoto ============= */
/* WARNING: Using BOT token on client is insecure. Prefer proxy. */
async function sendPhotoToTelegram(file, caption){
  // compress image a bit (optional) - keep simple: send directly
  const formData = new FormData();
  formData.append('chat_id', TELEGRAM_CHAT_ID);
  formData.append('photo', file);
  formData.append('caption', caption);
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    body: formData
  });
  if(!res.ok) throw new Error('Telegram API error: ' + res.statusText);
  return await res.json();
}

/* ============ VIEW BUKTI via getFile ============ */
async function viewBukti(trxId){
  const trx = transaksiData[trxId];
  if(!trx || !trx.telegram_photo || !trx.telegram_photo.file_id) return alert('Bukti tidak tersedia');
  // call getFile to obtain file_path
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${trx.telegram_photo.file_id}`);
    const data = await res.json();
    if(!data.ok) throw new Error('Tidak dapat ambil file');
    const file_path = data.result.file_path;
    const file_url = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file_path}`;
    // show modal
    modalBody.innerHTML = `<h3>Bukti Pembayaran</h3><p class="muted">${trx.telegram_photo.caption || ''}</p><img style="max-width:100%;border-radius:8px" src="${file_url}" alt="bukti">`;
    modal.classList.remove('hidden');
  } catch(e){
    console.error(e);
    alert('Gagal mendapatkan bukti: ' + e.message);
  }
}
modalClose.addEventListener('click', ()=> modal.classList.add('hidden'));

/* ============ SUMMARY CALCULATION ============ */
function calcSummary(){
  let pendapatan=0, totalModal=0, labaKotor=0, biayaOp=0;
  for(const id in transaksiData){
    const t = transaksiData[id];
    pendapatan += Number(t.total)||0;
    totalModal += Number(t.hpp)||0;
  }
  for(const id in operasionalData){
    biayaOp += Number(operasionalData[id].biaya) || 0;
  }
  labaKotor = pendapatan - totalModal;
  const labaBersih = labaKotor - biayaOp;
  pendapatanKotorEl.textContent = rupiah(pendapatan);
  totalModalEl.textContent = rupiah(totalModal);
  labaKotorEl.textContent = rupiah(labaKotor);
  biayaOperasionalEl.textContent = rupiah(biayaOp);
  labaBersihEl.textContent = rupiah(labaBersih);
}

/* ============ EDIT / DELETE PRODUK ============ */
window.editProduk = async (id) => {
  const p = produkData[id];
  if(!p) return alert('Produk tidak ditemukan');
  $('produkId').value = id;
  $('produkNama').value = p.nama;
  $('produkHarga').value = p.harga_jual;
  $('produkResep').value = JSON.stringify(p.resep || {});
  window.scrollTo(0,0);
};
window.deleteProduk = async (id) => {
  if(!confirm('Hapus produk ' + id + '?')) return;
  await db.ref('produk/'+id).remove();
};

/* ============ VIEW BUKTI GLOBAL ============ */
window.viewBukti = viewBukti;

/* ============ INITIAL RENDER ============ */
renderBahan(); renderProduk(); renderProdukForKasir(); renderOperasional(); renderRiwayat();
