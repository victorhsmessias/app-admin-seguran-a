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
      return () => unsubscribe();
    });
  };
  
  // Buscar check-ins por período
  // Função auxiliar para obter endereço a partir de coordenadas
const getAddressFromCoordinates = async (latitude, longitude) => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'SecurityMonitoringSystem/1.0'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();    
    if (data && data.display_name) {
      return data.display_name;
    } else {
      return 'Endereço não encontrado';
    }
  } catch (error) {
    console.error('Erro ao obter endereço:', error);
    return `Coordenadas: ${latitude}, ${longitude}`;
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
        
    // NOME CORRIGIDO DA COLEÇÃO: 'checkIns' em vez de 'check-ins'
    if (securityId) {
      q = query(
        collection(db, 'checkIns'),  // Nome corrigido aqui
        where('userId', '==', securityId),
        where('timestamp', '>=', Timestamp.fromDate(start)),
        where('timestamp', '<=', Timestamp.fromDate(end)),
        orderBy('timestamp', 'desc')
      );
    } else {
      q = query(
        collection(db, 'check-ins'),  // Nome corrigido aqui
        where('timestamp', '>=', Timestamp.fromDate(start)),
        where('timestamp', '<=', Timestamp.fromDate(end)),
        orderBy('timestamp', 'desc')
      );
    }
    
    const snapshot = await getDocs(q);    
    const checkIns = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
            
      // Verificar se o timestamp existe e converter para Date
      let checkInDate;
      if (data.timestamp && data.timestamp.toDate) {
        // Timestamp do Firestore
        checkInDate = data.timestamp.toDate();
      } else if (data.timestamp && typeof data.timestamp === 'string') {
        // String ISO
        checkInDate = new Date(data.timestamp);
      } else if (data.timestamp && typeof data.timestamp === 'number') {
        // Timestamp numérico
        checkInDate = new Date(data.timestamp);
      } else {
        continue; // Pular este check-in
      }
      
      // Verificar se a data está no intervalo
      if (checkInDate >= start && checkInDate <= end) {
        // Buscar informações do usuário
        let username = 'Usuário não identificado';
        let userDoc = null;
        
        try {
          userDoc = await getDoc(doc(db, 'users', data.userId));
          if (userDoc.exists()) {
            username = userDoc.data().username || userDoc.data().email || data.userId;
          } else {
            console.log("Documento do usuário não encontrado");
          }
        } catch (userError) {
          console.error("Erro ao buscar usuário:", userError);
        }
        
        // Processar localização
        let location = { latitude: 0, longitude: 0, accuracy: 0 };
        let address = 'Endereço não disponível';
        
        if (data.location) {
          location = data.location;
        } else if (data.latitude && data.longitude) {
          // Campo alternativo para latitude/longitude
          location = {
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy: data.accuracy || 0
          };
        }
        
        try {
          if (location.latitude && location.longitude) {
            address = await getAddressFromCoordinates(
              location.latitude,
              location.longitude
            );
          }
        } catch (addressError) {
          console.error("Erro ao obter endereço:", addressError);
        }
        
        // Adicionar à lista de resultados
        checkIns.push({
          id: doc.id,
          userId: data.userId,
          username: username,
          timestamp: checkInDate,
          location: location,
          photoUrl: data.photoUrl || '',
          address: address,
          deviceInfo: data.deviceInfo || '',
          user: userDoc ? {
            id: userDoc.id,
            ...userDoc.data()
          } : null
        });
      }
    }
    
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
