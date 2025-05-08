import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc, 
  query, 
  where,
  onSnapshot,
  getDocs 
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword,
  deleteUser,
  signOut,
  signInWithEmailAndPassword
} from 'firebase/auth';

import { auth, db } from '../firebase'; // Importe a instância auth específica

let adminCredentials = null;

// Lista de funções operacionais (não administrativas)
const operationalRoles = ['security', 'vigia', 'porteiro', 'zelador', 'supervisor', 'sdf'];

// Função auxiliar para verificar se é função operacional
export const isOperationalRole = (role) => {
  return operationalRoles.includes(role);
};

// Buscar todos os funcionários (atualizado para incluir todas as funções)
export const getAllSecurityGuards = () => {
  return new Promise((resolve, reject) => {
    // Alterado para buscar todos os usuários, não apenas os de segurança
    const q = query(collection(db, 'users'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const securityGuards = [];
      snapshot.forEach((doc) => {
        securityGuards.push({
          id: doc.id,
          ...doc.data()
        });
      });
      resolve({ data: securityGuards, unsubscribe });
    }, reject);
  });
};

// Buscar funcionários operacionais (para relatórios)
export const getOperationalStaff = () => {
  return new Promise((resolve, reject) => {
    const q = query(
      collection(db, 'users'), 
      where('role', 'in', operationalRoles)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const staff = [];
      snapshot.forEach((doc) => {
        staff.push({
          id: doc.id,
          ...doc.data()
        });
      });
      resolve({ data: staff, unsubscribe });
    }, reject);
  });
};

// Buscar um funcionário específico
export const getSecurityGuard = async (id) => {
  try {
    const docRef = doc(db, 'users', id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    } else {
      throw new Error('Funcionário não encontrado');
    }
  } catch (error) {
    console.error('Erro ao buscar funcionário:', error);
    throw error;
  }
};

// Criar um novo funcionário 
export const createSecurityGuard = async (guardData, password, adminEmail, adminPassword) => {
  try {
    
    // 1. Salvar as credenciais do admin para re-login posterior
    adminCredentials = {
      email: adminEmail,
      password: adminPassword
    };
    
    // 2. Obter o UID do admin atual antes da troca de usuário
    const adminUid = auth.currentUser ? auth.currentUser.uid : null;
    
    // 3. Criar o novo usuário (isso automaticamente fará login com ele)
    const userCredential = await createUserWithEmailAndPassword(
      auth, 
      guardData.email, 
      password
    );
    
    
    // 4. Preparar dados para salvar no Firestore
    const userData = {
      username: guardData.username,
      email: guardData.email,
      phone: guardData.phone || '',
      role: guardData.role || 'security',
      createdAt: new Date().toISOString(),
      createdBy: adminUid || 'unknown'
    };
    
    // 5. Salvar dados no Firestore
    await setDoc(doc(db, 'users', userCredential.user.uid), userData);
    
    // 6. Fazer logout do novo usuário
    await signOut(auth);
    
    // 7. Fazer login novamente com o admin
    if (adminCredentials) {
      await signInWithEmailAndPassword(auth, adminCredentials.email, adminCredentials.password);
      adminCredentials = null; // Limpar credenciais após uso
    }
    
    return {
      id: userCredential.user.uid,
      ...userData
    };
  } catch (error) {
    console.error('Erro ao criar funcionário:', error);
    
    // Se ocorrer um erro, tentar fazer login novamente com o admin
    if (adminCredentials) {
      try {
        await signInWithEmailAndPassword(auth, adminCredentials.email, adminCredentials.password);
      } catch (loginError) {
        console.error("Erro ao reconectar admin:", loginError);
      }
      adminCredentials = null;
    }
    
    throw error;
  }
};

// Atualizar um funcionário existente
export const updateSecurityGuard = async (id, guardData) => {
  try {
    // Verificar autenticação atual
    if (!auth.currentUser) {
      throw new Error("Usuário não autenticado");
    }
    
    // Verificar permissões do usuário atual
    const adminDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
    if (!adminDoc.exists() || adminDoc.data().role !== 'admin') {
      throw new Error("Permissão insuficiente para atualizar");
    }
    
    // Filtrar apenas campos permitidos para atualização
    const updateData = {
      username: guardData.username,
      phone: guardData.phone,
      role: guardData.role,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.currentUser.uid
    };
    
    
    // Atualizar documento
    await updateDoc(doc(db, 'users', id), updateData);
    
    
    return {
      id,
      ...updateData
    };
  } catch (error) {
    console.error('Erro ao atualizar funcionário:', error);
    throw error;
  }
};

// Excluir um funcionário
export const deleteSecurityGuard = async (id) => {
  try {
    
    // Verificar se o usuário está autenticado
    if (!auth.currentUser) {
      console.error("Nenhum usuário autenticado");
      throw new Error("Você precisa estar autenticado para realizar esta operação");
    }
    
    // Forçar renovação do token de autenticação
    await auth.currentUser.getIdToken(true);
    
    // Obter documento do usuário atual para verificar se é admin
    const currentUserRef = doc(db, 'users', auth.currentUser.uid);
    const currentUserSnap = await getDoc(currentUserRef);
    
    if (!currentUserSnap.exists()) {
      console.error("Documento do usuário atual não encontrado");
      throw new Error("Seu perfil de usuário não foi encontrado");
    }
    
    const currentUserData = currentUserSnap.data();
    
    if (currentUserData.role !== 'admin') {
      console.error("Usuário não tem papel de admin");
      throw new Error("Você não tem permissões de administrador para excluir usuários");
    }
    
    // Verificar se o documento a ser excluído existe
    const userToDeleteRef = doc(db, 'users', id);
    const userToDeleteSnap = await getDoc(userToDeleteRef);
    
    if (!userToDeleteSnap.exists()) {
      console.error("Usuário a ser excluído não existe");
      throw new Error("O usuário que você está tentando excluir não existe");
    }
    
    // Excluir o documento do Firestore
    await deleteDoc(userToDeleteRef);
    
    return true;
  } catch (error) {
    console.error('Erro ao excluir funcionário:', error);
    throw error;
  }
};

// Obter contagem de funcionários por função
export const getStaffCountByRole = async () => {
  try {
    const snapshot = await getDocs(collection(db, 'users'));
    
    // Inicializar contadores
    const counts = {
      admin: 0,
      security: 0,
      vigia: 0,
      porteiro: 0,
      zelador: 0,
      rh: 0,
      supervisor: 0,
      sdf: 0,
      total: 0
    };
    
    // Contar funcionários por função
    snapshot.forEach(doc => {
      const userData = doc.data();
      counts.total++;
      
      if (userData.role && counts[userData.role] !== undefined) {
        counts[userData.role]++;
      } else {
        // Para funções não reconhecidas
        counts.security++; // Considerando como segurança por padrão
      }
    });
    
    return counts;
  } catch (error) {
    console.error('Erro ao obter contagem de funcionários:', error);
    throw error;
  }
};
