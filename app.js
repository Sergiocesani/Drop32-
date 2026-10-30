/**
 * =========================================================================
 * +32 DROP - SISTEMA DE TIENDA WEB CON FIREBASE FIRESTORE v9+
 * =========================================================================
 * 
 * GUÍA DE FIRESTORE:
 * 1. Colección objetivo: "productos"
 * 2. Estructura recomendada para cada documento en Firestore:
 *    - nombre: (string) Ej: "Remera Oversize Black Box"
 *    - precio: (number) Ej: 42000
 *    - stock: (number) Ej: 15
 *    - imagenUrl: (string) URL de la imagen (Firebase Storage o web externa)
 *    - categoria: (string) Ej: "ropa", "zapatillas", "relojes", "tecnologia", "accesorios"
 *    - talleOColor: (string opcional) Ej: "Negro, Talle L"
 * =========================================================================
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  runTransaction, 
  doc 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// ==========================================
// 1. CONFIGURACIÓN DE FIREBASE
// Pega aquí las credenciales obtenidas de tu consola de Firebase
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyCK5yxTZXiIVYwkSg9nDt3v4bkyaeyTe3w",
  authDomain: "drop32-jnc.firebaseapp.com",
  projectId: "drop32-jnc",
  storageBucket: "drop32-jnc.firebasestorage.app",
  messagingSenderId: "342269791406",
  appId: "1:342269791406:web:03f5fa4e468b89dde9b13f"
};

// Inicialización de Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Constantes generales
const WHATSAPP_NUMBER = "541137693337";
let productsState = []; // Catálogo sincronizado en memoria
let cartState = JSON.parse(localStorage.getItem("+32drop_cart")) || [];
let activeCategory = "todos";

// Elementos DOM
const productsGrid = document.getElementById("products-grid");
const catalogLoader = document.getElementById("catalog-loader");
const cartBadge = document.getElementById("cart-counter");
const cartItemsContainer = document.getElementById("cart-items");
const cartTotalPrice = document.getElementById("cart-total-price");
const checkoutBtn = document.getElementById("checkout-btn");
const cartDrawer = document.getElementById("cart-drawer");
const cartOverlay = document.getElementById("cart-drawer-overlay");
const openCartBtn = document.getElementById("open-cart-btn");
const closeCartBtn = document.getElementById("close-cart-btn");
const categoryButtons = document.querySelectorAll(".cat-pill");

// ==========================================
// 2. ESCUCHA EN TIEMPO REAL DE PRODUCTOS
// ==========================================
function initProductsListener() {
  const productsRef = collection(db, "productos");

  onSnapshot(productsRef, (snapshot) => {
    productsState = [];
    snapshot.forEach((docSnap) => {
      productsState.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    if (catalogLoader) {
      catalogLoader.style.display = "none";
    }

    renderCatalog();
    reconcileCartWithStock();
    renderCart();
  }, (error) => {
    console.error("Error al escuchar productos en Firestore:", error);
    if (catalogLoader) {
      catalogLoader.innerHTML = `<p style="color: #ff5555;">No se pudo conectar a Firebase. Revisa las credenciales o reglas de seguridad.</p>`;
    }
  });
}

// ==========================================
// 3. RENDERIZADO DEL CATÁLOGO
// ==========================================
function renderCatalog() {
  const filteredProducts = activeCategory === "todos" 
    ? productsState 
    : productsState.filter(p => (p.categoria || "").toLowerCase() === activeCategory.toLowerCase());

  if (filteredProducts.length === 0) {
    productsGrid.innerHTML = `<p class="empty-cart-msg">No se encontraron productos disponibles en esta categoría.</p>`;
    return;
  }

  productsGrid.innerHTML = filteredProducts.map(product => {
    const isOutOfStock = !product.stock || product.stock <= 0;
    const formattedPrice = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(product.precio || 0);

    return `
      <article class="product-card">
        <div class="card-image-box">
          <img src="${product.imagenUrl || 'https://via.placeholder.com/400x400/121212/ffffff?text=+32+DROP'}" alt="${product.nombre}" loading="lazy">
          <span class="stock-tag">${isOutOfStock ? 'AGOTADO' : `STOCK: ${product.stock}`}</span>
        </div>
        <div class="card-body">
          <span class="card-category">${product.categoria || 'DROP'}</span>
          <h3 class="card-title">${product.nombre}</h3>
          <p class="card-details">${product.talleOColor || 'Edición Limitada'}</p>
          <div class="card-bottom">
            <span class="card-price">${formattedPrice}</span>
            <button 
              class="add-btn" 
              data-id="${product.id}" 
              ${isOutOfStock ? 'disabled' : ''}>
              ${isOutOfStock ? 'Agotado' : 'Añadir al carrito'}
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  // Añadir eventos a botones de agregar
  document.querySelectorAll(".add-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const prodId = btn.getAttribute("data-id");
      addToCart(prodId);
    });
  });
}

// ==========================================
// 4. LÓGICA DEL CARRITO
// ==========================================
function addToCart(productId) {
  const product = productsState.find(p => p.id === productId);
  if (!product || product.stock <= 0) return;

  const existingItem = cartState.find(item => item.id === productId);

  if (existingItem) {
    if (existingItem.quantity < product.stock) {
      existingItem.quantity += 1;
      showToast(`+1 ${product.nombre}`);
    } else {
      showToast(`Alcanzaste el stock máximo de este artículo.`);
      return;
    }
  } else {
    cartState.push({
      id: product.id,
      nombre: product.nombre,
      precio: product.precio,
      imagenUrl: product.imagenUrl,
      talleOColor: product.talleOColor || '',
      quantity: 1
    });
    showToast(`Producto añadido`);
  }

  saveCart();
  renderCart();
  openCart();
}

function updateItemQuantity(productId, delta) {
  const itemIndex = cartState.findIndex(item => item.id === productId);
  if (itemIndex === -1) return;

  const prodDb = productsState.find(p => p.id === productId);
  const currentItem = cartState[itemIndex];

  if (delta > 0) {
    if (prodDb && currentItem.quantity >= prodDb.stock) {
      showToast("No hay más unidades en stock.");
      return;
    }
    currentItem.quantity += 1;
  } else {
    currentItem.quantity -= 1;
    if (currentItem.quantity <= 0) {
      cartState.splice(itemIndex, 1);
    }
  }

  saveCart();
  renderCart();
}

function reconcileCartWithStock() {
  // Corrige cantidades en el carrito si el stock bajó en tiempo real
  cartState = cartState.filter(cartItem => {
    const prodDb = productsState.find(p => p.id === cartItem.id);
    if (!prodDb || prodDb.stock <= 0) return false;
    if (cartItem.quantity > prodDb.stock) {
      cartItem.quantity = prodDb.stock;
    }
    return true;
  });
  saveCart();
}

function saveCart() {
  localStorage.setItem("+32drop_cart", JSON.stringify(cartState));
}

function renderCart() {
  // Actualizar contador
  const totalUnits = cartState.reduce((acc, curr) => acc + curr.quantity, 0);
  cartBadge.innerText = totalUnits;

  if (cartState.length === 0) {
    cartItemsContainer.innerHTML = `<p class="empty-cart-msg">Tu carrito está vacío.</p>`;
    cartTotalPrice.innerText = "$0";
    checkoutBtn.disabled = true;
    return;
  }

  checkoutBtn.disabled = false;
  let total = 0;

  cartItemsContainer.innerHTML = cartState.map(item => {
    const subtotal = item.precio * item.quantity;
    total += subtotal;
    const formattedPrice = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(subtotal);

    return `
      <div class="cart-item">
        <img class="cart-item-img" src="${item.imagenUrl || 'https://via.placeholder.com/60'}" alt="${item.nombre}">
        <div class="cart-item-info">
          <h4>${item.nombre}</h4>
          <p>${item.talleOColor}</p>
          <div class="cart-item-price">${formattedPrice}</div>
        </div>
        <div class="qty-control">
          <button class="qty-btn" onclick="window.changeQty('${item.id}', -1)"><i class="fa-solid fa-minus"></i></button>
          <span class="qty-num">${item.quantity}</span>
          <button class="qty-btn" onclick="window.changeQty('${item.id}', 1)"><i class="fa-solid fa-plus"></i></button>
        </div>
      </div>
    `;
  }).join("");

  cartTotalPrice.innerText = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(total);
}

// Exponer la función de cambio de cantidad para los listeners inline
window.changeQty = (id, delta) => updateItemQuantity(id, delta);

// ==========================================
// 5. CHECKOUT ATÓMICO CON FIRESTORE & WHATSAPP
// ==========================================
async function handleCheckout() {
  if (cartState.length === 0) return;

  checkoutBtn.disabled = true;
  checkoutBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Validando stock...`;

  try {
    // Transacción Firestore: Asegura lectura y resta simultánea sin condiciones de carrera
    await runTransaction(db, async (transaction) => {
      // 1. Validar todos los documentos primero
      const reads = [];
      for (const item of cartState) {
        const productRef = doc(db, "productos", item.id);
        reads.push({ item, ref: productRef });
      }

      const snapshots = [];
      for (const { item, ref } of reads) {
        const prodSnap = await transaction.get(ref);
        if (!prodSnap.exists()) {
          throw new Error(`El producto "${item.nombre}" ya no existe.`);
        }
        const currentStock = prodSnap.data().stock || 0;
        if (currentStock < item.quantity) {
          throw new Error(`Stock insuficiente para "${item.nombre}". Disponibles: ${currentStock}`);
        }
        snapshots.push({ ref, newStock: currentStock - item.quantity });
      }

      // 2. Realizar las escrituras atómicas
      for (const { ref, newStock } of snapshots) {
        transaction.update(ref, { stock: newStock });
      }
    });

    // Si la transacción fue exitosa, generar enlace a WhatsApp
    redirectToWhatsApp();

    // Limpiar carrito
    cartState = [];
    saveCart();
    renderCart();
    closeCart();
    showToast("¡Pedido procesado correctamente!");

  } catch (err) {
    console.error("Error al completar checkout:", err);
    alert(`No se pudo procesar la compra: ${err.message}`);
  } finally {
    checkoutBtn.disabled = false;
    checkoutBtn.innerHTML = `<i class="fa-brands fa-whatsapp"></i><span>FINALIZAR PEDIDO</span>`;
  }
}

function redirectToWhatsApp() {
  let message = "Hola ! quiero realizar el siguiente pedido:\n";
  let total = 0;

  cartState.forEach(item => {
    const itemTotal = item.precio * item.quantity;
    total += itemTotal;
    const formatSub = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(itemTotal);
    const detail = item.talleOColor ? ` (${item.talleOColor})` : "";
    message += `- ${item.quantity}x ${item.nombre}${detail} - ${formatSub}\n`;
  });

  const formatTotal = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(total);
  message += `\n- Total: ${formatTotal}.`;

  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`;

  window.open(whatsappUrl, "_blank");
}

// ==========================================
// 6. UI & LISTENERS
// ==========================================
function openCart() {
  cartDrawer.classList.add("active");
  cartOverlay.classList.add("active");
}

function closeCart() {
  cartDrawer.classList.remove("active");
  cartOverlay.classList.remove("active");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.innerText = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

// Filtros de categoría
categoryButtons.forEach(button => {
  button.addEventListener("click", () => {
    categoryButtons.forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    activeCategory = button.getAttribute("data-category");
    renderCatalog();
  });
});

openCartBtn.addEventListener("click", openCart);
closeCartBtn.addEventListener("click", closeCart);
cartOverlay.addEventListener("click", closeCart);
checkoutBtn.addEventListener("click", handleCheckout);

// Arranque
initProductsListener();
renderCart();