// src/services/monitoringService.js
import { collection, addDoc, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { uploadImage } from './cloudinaryService';

// Registrar check-in com localização e foto
export const registerCheckIn = async (userId, locationData, photoData) => {
  try {
    // Upload da foto para o Cloudinary
    const cloudinaryResult = await uploadImage(photoData);
    const photoUrl = cloudinaryResult.url;
    
    // Salvar dados de check-in no Firestore
    const checkInData = {
      userId,
      latitude: locationData.lat,
      longitude: locationData.lng,
      accuracy: locationData.accuracy,
      photoUrl,
      timestamp: Timestamp.now(),
      device: navigator.userAgent || 'Unknown'
    };
    
    const docRef = await addDoc(collection(db, 'check-ins'), checkInData);
    
    return {
      id: docRef.id,
      ...checkInData,
      timestamp: checkInData.timestamp.toDate()
    };
  } catch (error) {
    console.error('Erro ao registrar check-in:', error);
    throw error;
  }
};