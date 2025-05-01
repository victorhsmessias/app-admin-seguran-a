import { 
    collection, 
    query, 
    where, 
    orderBy, 
    limit, 
    startAfter,
    getDocs,
    getDoc,
    doc,
    onSnapshot,
    Timestamp 
  } from 'firebase/firestore';
  import { db } from '../firebase';
  
  // Buscar check-ins em tempo real
  export const getRealtimeCheckIns = (limitCount = 20) => {
    return new Promise((resolve, reject) => {
      const q = query(
        collection(db, 'check-ins'),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
      
      const unsubscribe = onSnapshot(q, async (snapshot) => {
        const checkIns = [];
        
        // Para cada check-in, buscar informações do segurança
        const promises = snapshot.docs.map(async (checkInDoc) => {
          const checkInData = checkInDoc.data();
          const userDoc = await getDoc(doc(db, 'users', checkInData.userId));
          
          checkIns.push({
            id: checkInDoc.id,
            ...checkInData,
            timestamp: checkInData.timestamp.toDate(),
            user: userDoc.exists() ? {
              id: userDoc.id,
              ...userDoc.data()
            } : { id: checkInData.userId }
          });
        });
        
        await Promise.all(promises);
        
        // Ordenar por timestamp (mais recente primeiro)
        checkIns.sort((a, b) => b.timestamp - a.timestamp);
        
        resolve({ data: checkIns, unsubscribe });
      }, reject);
    });
  };
  
  // Buscar check-ins por período
  // Função auxiliar para obter endereço a partir de coordenadas
const getAddressFromCoordinates = async (latitude, longitude) => {
  try {
    // Usando Nominatim (OpenStreetMap) - Serviço gratuito
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'SecurityMonitoringSystem/1.0' // Nome do seu aplicativo
        }
      }
    );
    
    const data = await response.json();
    
    if (data && data.display_name) {
      return data.display_name;
    } else {
      return 'Endereço não encontrado';
    }
  } catch (error) {
    console.error('Erro ao obter endereço:', error);
    return 'Erro ao obter endereço';
  }
};

// Função principal atualizada
export const getCheckInsByDateRange = async (startDate, endDate, securityId = null) => {
  try {
    let q;
    
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    if (securityId) {
      q = query(
        collection(db, 'check-ins'),
        where('userId', '==', securityId),
        where('timestamp', '>=', Timestamp.fromDate(start)),
        where('timestamp', '<=', Timestamp.fromDate(end)),
        orderBy('timestamp', 'desc')
      );
    } else {
      q = query(
        collection(db, 'check-ins'),
        where('timestamp', '>=', Timestamp.fromDate(start)),
        where('timestamp', '<=', Timestamp.fromDate(end)),
        orderBy('timestamp', 'desc')
      );
    }
    
    const snapshot = await getDocs(q);
    const checkIns = [];
    
    // Para cada check-in, buscar informações do segurança e endereço
    const promises = snapshot.docs.map(async (checkInDoc) => {
      const checkInData = checkInDoc.data();
      const userDoc = await getDoc(doc(db, 'users', checkInData.userId));
      
      // Obter endereço a partir das coordenadas
      let address = 'Endereço não disponível';
      if (checkInData.location && checkInData.location.latitude && checkInData.location.longitude) {
        address = await getAddressFromCoordinates(
          checkInData.location.latitude,
          checkInData.location.longitude
        );
      }
      
      // Username é importante para exibição nos relatórios
      const username = userDoc.exists() 
        ? userDoc.data().username 
        : 'Usuário não encontrado';
      
      checkIns.push({
        id: checkInDoc.id,
        ...checkInData,
        timestamp: checkInData.timestamp.toDate(),
        username: username,
        address: address,
        user: userDoc.exists() ? {
          id: userDoc.id,
          ...userDoc.data()
        } : { id: checkInData.userId }
      });
    });
    
    // Aguardar que todas as promessas sejam resolvidas
    await Promise.all(promises);
    
    // Ordenar pelo timestamp (mais recente primeiro)
    checkIns.sort((a, b) => b.timestamp - a.timestamp);
    
    return checkIns;
  } catch (error) {
    console.error('Erro ao buscar check-ins por período:', error);
    throw error;
  }
};
  
  // Buscar check-ins por segurança
  export const getCheckInsBySecurityGuard = async (securityId, limitCount = 20) => {
    try {
      const q = query(
        collection(db, 'check-ins'),
        where('userId', '==', securityId),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
      
      const snapshot = await getDocs(q);
      const checkIns = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        checkIns.push({
          id: doc.id,
          ...data,
          timestamp: data.timestamp.toDate()
        });
      });
      
      return checkIns;
    } catch (error) {
      console.error('Erro ao buscar check-ins por segurança:', error);
      throw error;
    }
  };
  
  // Buscar estatísticas de check-ins
  export const getCheckInStats = async () => {
    try {
      // Check-ins de hoje
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayQuery = query(
        collection(db, 'check-ins'),
        where('timestamp', '>=', Timestamp.fromDate(today))
      );
      
      const todaySnapshot = await getDocs(todayQuery);
      
      // Total de check-ins
      const totalQuery = query(collection(db, 'check-ins'));
      const totalSnapshot = await getDocs(totalQuery);
      
      // Último check-in
      const latestQuery = query(
        collection(db, 'check-ins'),
        orderBy('timestamp', 'desc'),
        limit(1)
      );
      
      const latestSnapshot = await getDocs(latestQuery);
      let latestCheckIn = null;
      
      if (!latestSnapshot.empty) {
        const doc = latestSnapshot.docs[0];
        const data = doc.data();
        const userDoc = await getDoc(doc(db, 'users', data.userId));
        
        latestCheckIn = {
          id: doc.id,
          ...data,
          timestamp: data.timestamp.toDate(),
          user: userDoc.exists() ? {
            id: userDoc.id,
            ...userDoc.data()
          } : { id: data.userId }
        };
      }
      
      return {
        todayCount: todaySnapshot.size,
        totalCount: totalSnapshot.size,
        latestCheckIn
      };
    } catch (error) {
      console.error('Erro ao buscar estatísticas de check-ins:', error);
      throw error;
    }
  };