// src/services/authService.js
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  onAuthStateChanged 
} from 'firebase/auth';
import { getDoc, doc } from 'firebase/firestore';
import { auth, db } from '../firebase';

// Login com email e senha
export const loginWithEmailAndPassword = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    throw error;
  }
};

export const getUserRole = async (userId) => {
  try {
    // Assumindo que você já configurou a referência ao Firestore
    const userDoc = await getDoc(doc(db, "users", userId));
    
    if (userDoc.exists()) {
      return userDoc.data().role || 'user'; // 'user' como fallback padrão
    } else {
      console.log("Usuário não encontrado no Firestore");
      return 'user'; // Papel padrão
    }
  } catch (error) {
    console.log("Erro ao buscar papel do usuário:", error);
    return 'user'; // Papel padrão em caso de erro
  }
};

// Registro de usuário (para uso administrativo)
export const registerWithEmailAndPassword = async (email, password) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    throw error;
  }
};

// Logout
export const logout = async () => {
  try {
    await signOut(auth);
    return true;
  } catch (error) {
    throw error;
  }
};

// Obter usuário atual
export const getCurrentUser = () => {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    }, reject);
  });
};

// Verificar se o usuário está logado
export const isUserLoggedIn = () => {
  return !!auth.currentUser;
};