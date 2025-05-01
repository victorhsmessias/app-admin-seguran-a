// src/services/cloudinaryService.js
import axios from 'axios';

const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${process.env.REACT_APP_CLOUDINARY_CLOUD_NAME}/image/upload`;
const UPLOAD_PRESET = process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET;

export const uploadImage = async (imageData) => {
  try {
    const formData = new FormData();
    formData.append('file', imageData);
    formData.append('upload_preset', UPLOAD_PRESET);
    
    const response = await axios.post(CLOUDINARY_UPLOAD_URL, formData);
    
    return {
      url: response.data.secure_url,
      publicId: response.data.public_id
    };
  } catch (error) {
    console.error('Erro ao fazer upload de imagem:', error);
    throw error;
  }
};

export const optimizeImageUrl = (url, width = 800, height = 600) => {
  if (!url || !url.includes('cloudinary.com')) {
    return url;
  }
  
  // Inserir parâmetros de transformação na URL do Cloudinary
  const uploadIndex = url.indexOf('/upload/');
  if (uploadIndex === -1) return url;
  
  return `${url.slice(0, uploadIndex + 8)}w_${width},h_${height},c_fill,q_auto/${url.slice(uploadIndex + 8)}`;
};