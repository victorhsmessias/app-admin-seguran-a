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
  getDocs,
  deleteField 
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword,
  deleteUser,
  signOut,
  signInWithEmailAndPassword
} from 'firebase/auth';

import { auth, db } from '../firebase';

let adminCredentials = null;

const operationalRoles = ['security', 'vigia', 'porteiro', 'zelador', 'supervisor', 'sdf'];

// Função auxiliar para verificar se é função operacional
export const isOperationalRole = (role) => {
  return operationalRoles.includes(role);
};

// Buscar todos os funcionários (atualizado para incluir todas as funções)
export const getAllSecurityGuards = () => {
  return new Promise((resolve, reject) => {
    const q = query(collection(db, 'users'));
    
    const unsubscribe = onSnapshot(q, 
      {
        // CORREÇÃO: Incluir metadados para detectar mudanças do cache vs servidor
        includeMetadataChanges: true
      },
      (snapshot) => {
        const securityGuards = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          securityGuards.push({
            id: doc.id,
            ...data,
            // Garantir que o status existe (padrão: ativo)
            status: data.status || 'active',
            // Adicionar informação se veio do cache ou servidor
            fromCache: snapshot.metadata.fromCache
          });
        });        
        resolve({ data: securityGuards, unsubscribe });
      }, 
      (error) => {
        console.error("Erro no listener do Firestore:", error);
        reject(error);
      }
    );
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
        const data = doc.data();
        staff.push({
          id: doc.id,
          ...data,
          status: data.status || 'active'
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
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        status: data.status || 'active'
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
    adminCredentials = {
      email: adminEmail,
      password: adminPassword
    };
    
    const adminUid = auth.currentUser ? auth.currentUser.uid : null;
    
    const userCredential = await createUserWithEmailAndPassword(
      auth, 
      guardData.email, 
      password
    );
    
    const userData = {
      username: guardData.username,
      email: guardData.email,
      phone: guardData.phone || '',
      role: guardData.role || 'security',
      status: 'active', // Sempre criar como ativo
      createdAt: new Date().toISOString(),
      createdBy: adminUid || 'unknown'
    };
    
    await setDoc(doc(db, 'users', userCredential.user.uid), userData);
    
    await signOut(auth);
    
    if (adminCredentials) {
      await signInWithEmailAndPassword(auth, adminCredentials.email, adminCredentials.password);
      adminCredentials = null;
    }
    
    return {
      id: userCredential.user.uid,
      ...userData
    };
  } catch (error) {
    console.error('Erro ao criar funcionário:', error);
    
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
    if (!auth.currentUser) {
      throw new Error("Usuário não autenticado");
    }
    
    const adminDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
    if (!adminDoc.exists() || adminDoc.data().role !== 'admin') {
      throw new Error("Permissão insuficiente para atualizar");
    }
    
    const updateData = {
      username: guardData.username,
      phone: guardData.phone,
      role: guardData.role,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.currentUser.uid
    };
    
    // Incluir status se fornecido
    if (guardData.status) {
      updateData.status = guardData.status;
    }
    
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

// Bloquear um funcionário
export const blockEmployee = async (employeeId, reason = '') => {
  try {
    if (!auth.currentUser) {
      throw new Error("Usuário não autenticado");
    }
    
    // Verificar se é admin
    const adminDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
    if (!adminDoc.exists() || adminDoc.data().role !== 'admin') {
      throw new Error("Permissão insuficiente para bloquear funcionário");
    }
    
    // Verificar se o funcionário existe
    const employeeDoc = await getDoc(doc(db, 'users', employeeId));
    if (!employeeDoc.exists()) {
      throw new Error("Funcionário não encontrado");
    }
    
    // Não permitir bloquear outros admins
    const employeeData = employeeDoc.data();
    if (employeeData.role === 'admin') {
      throw new Error("Não é possível bloquear outros administradores");
    }
    
    const updateData = {
      status: 'blocked',
      blockedAt: new Date().toISOString(),
      blockedBy: auth.currentUser.uid,
      blockReason: reason || 'Bloqueado pelo administrador',
      updatedAt: new Date().toISOString()
    };
    
    await updateDoc(doc(db, 'users', employeeId), updateData);
    
    return {
      success: true,
      message: 'Funcionário bloqueado com sucesso'
    };
  } catch (error) {
    console.error('Erro ao bloquear funcionário:', error);
    throw error;
  }
};

// Desbloquear funcionário
export const unblockEmployee = async (employeeId) => {
  try {
    if (!auth.currentUser) {
      throw new Error("Usuário não autenticado");
    }
    
    // Verificar se é admin
    const adminDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
    if (!adminDoc.exists() || adminDoc.data().role !== 'admin') {
      throw new Error("Permissão insuficiente para desbloquear funcionário");
    }
    
    // Verificar se o funcionário existe
    const employeeDoc = await getDoc(doc(db, 'users', employeeId));
    if (!employeeDoc.exists()) {
      throw new Error("Funcionário não encontrado");
    }
    
    const updateData = {
      status: 'active',
      unblockedAt: new Date().toISOString(),
      unblockedBy: auth.currentUser.uid,
      updatedAt: new Date().toISOString(),
      // CORREÇÃO: Usar deleteField() para remover campos do Firestore
      blockedAt: deleteField(),
      blockedBy: deleteField(),
      blockReason: deleteField()
    };
    
    await updateDoc(doc(db, 'users', employeeId), updateData);    
    return {
      success: true,
      message: 'Funcionário desbloqueado com sucesso'
    };
  } catch (error) {
    console.error('Erro ao desbloquear funcionário:', error);
    throw error;
  }
};

// Verificar se funcionário está bloqueado
export const checkEmployeeStatus = async (employeeId) => {
  try {
    const employeeDoc = await getDoc(doc(db, 'users', employeeId));
    
    if (!employeeDoc.exists()) {
      return { blocked: true, reason: 'Funcionário não encontrado' };
    }
    
    const employeeData = employeeDoc.data();
    const status = employeeData.status || 'active';
    
    return {
      blocked: status === 'blocked',
      reason: employeeData.blockReason || null,
      blockedAt: employeeData.blockedAt || null
    };
  } catch (error) {
    console.error('Erro ao verificar status do funcionário:', error);
    return { blocked: true, reason: 'Erro ao verificar status' };
  }
};

// Excluir um funcionário
export const deleteSecurityGuard = async (id) => {
  try {
    if (!auth.currentUser) {
      console.error("Nenhum usuário autenticado");
      throw new Error("Você precisa estar autenticado para realizar esta operação");
    }
    
    await auth.currentUser.getIdToken(true);
    
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
    
    const userToDeleteRef = doc(db, 'users', id);
    const userToDeleteSnap = await getDoc(userToDeleteRef);
    
    if (!userToDeleteSnap.exists()) {
      console.error("Usuário a ser excluído não existe");
      throw new Error("O usuário que você está tentando excluir não existe");
    }
    
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
    
    const counts = {
      admin: 0,
      security: 0,
      vigia: 0,
      porteiro: 0,
      zelador: 0,
      rh: 0,
      supervisor: 0,
      sdf: 0,
      total: 0,
      active: 0,
      blocked: 0
    };
    
    snapshot.forEach(doc => {
      const userData = doc.data();
      counts.total++;
      
      // Contar status
      const status = userData.status || 'active';
      if (status === 'active') {
        counts.active++;
      } else if (status === 'blocked') {
        counts.blocked++;
      }
      
      // Contar por função
      if (userData.role && counts[userData.role] !== undefined) {
        counts[userData.role]++;
      } else {
        counts.security++;
      }
    });
    
    return counts;
  } catch (error) {
    console.error('Erro ao obter contagem de funcionários:', error);
    throw error;
  }
};
