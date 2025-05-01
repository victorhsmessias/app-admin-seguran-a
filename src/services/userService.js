import { 
    collection, 
    doc, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    getDocs, 
    getDoc, 
    query, 
    where 
  } from 'firebase/firestore';
  import { createUserWithEmailAndPassword } from 'firebase/auth';
  import { auth, db } from '../firebase';
  
  // Criar um novo funcionário (pelo admin)
  export const createEmployee = async (employeeData, password) => {
    try {
      // Criar conta de autenticação
      const userCredential = await createUserWithEmailAndPassword(auth, employeeData.email, password);
      const user = userCredential.user;
      
      // Salvar dados do funcionário no Firestore
      await setDoc(doc(db, 'users', user.uid), {
        ...employeeData,
        role: 'security',
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser.uid
      });
      
      return {
        uid: user.uid,
        ...employeeData
      };
    } catch (error) {
      throw error;
    }
  };
  
  // Atualizar dados de um funcionário
  export const updateEmployee = async (userId, employeeData) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        ...employeeData,
        updatedAt: new Date().toISOString()
      });
      
      return {
        uid: userId,
        ...employeeData
      };
    } catch (error) {
      throw error;
    }
  };
  
  // Excluir um funcionário
  export const deleteEmployee = async (userId) => {
    try {
      await deleteDoc(doc(db, 'users', userId));
      return true;
    } catch (error) {
      throw error;
    }
  };
  
  // Obter todos os funcionários
  export const getAllEmployees = async () => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'security'));
      const querySnapshot = await getDocs(q);
      const employees = [];
      
      querySnapshot.forEach((doc) => {
        employees.push({
          uid: doc.id,
          ...doc.data()
        });
      });
      
      return employees;
    } catch (error) {
      throw error;
    }
  };
  
  // Obter um funcionário específico
  export const getEmployeeById = async (userId) => {
    try {
      const docRef = doc(db, 'users', userId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return {
          uid: docSnap.id,
          ...docSnap.data()
        };
      } else {
        throw new Error('Funcionário não encontrado');
      }
    } catch (error) {
      throw error;
    }
  };