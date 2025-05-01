import { 
    collection, 
    doc, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    getDocs, 
    getDoc, 
    query, 
    where,
    onSnapshot 
  } from 'firebase/firestore';
  import { createUserWithEmailAndPassword, updateEmail, deleteUser, getAuth } from 'firebase/auth';
  import { db } from '../firebase';
  
  // Buscar todos os seguranças
  export const getAllSecurityGuards = () => {
    return new Promise((resolve, reject) => {
      // Criando um listener que atualizará em tempo real
      const q = query(
        collection(db, 'users'), 
        where('role', '==', 'security')
      );
      
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
  
  // Buscar um segurança específico
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
        throw new Error('Segurança não encontrado');
      }
    } catch (error) {
      console.error('Erro ao buscar segurança:', error);
      throw error;
    }
  };
  
  // Criar um novo segurança
  export const createSecurityGuard = async (guardData, password) => {
    try {
      const auth = getAuth();
      
      // Criar usuário no Authentication
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        guardData.email, 
        password
      );
      
      // Adicionar dados adicionais no Firestore
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        ...guardData,
        createdAt: new Date().toISOString()
      });
      
      return {
        id: userCredential.user.uid,
        ...guardData
      };
    } catch (error) {
      console.error('Erro ao criar segurança:', error);
      throw error;
    }
  };
  
  // Atualizar um segurança existente
  export const updateSecurityGuard = async (id, guardData) => {
    try {
      await updateDoc(doc(db, 'users', id), {
        ...guardData,
        updatedAt: new Date().toISOString()
      });
      
      return {
        id,
        ...guardData
      };
    } catch (error) {
      console.error('Erro ao atualizar segurança:', error);
      throw error;
    }
  };
  
  // Excluir um segurança
  export const deleteSecurityGuard = async (id) => {
    try {
      // Excluir do Firestore
      await deleteDoc(doc(db, 'users', id));
      
      // Nota: A exclusão do usuário do Authentication é mais complexa
      // e geralmente requer funções Cloud do Firebase
      
      return true;
    } catch (error) {
      console.error('Erro ao excluir segurança:', error);
      throw error;
    }
  };