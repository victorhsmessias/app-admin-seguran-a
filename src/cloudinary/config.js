// src/cloudinary/config.js
import { Cloudinary } from '@cloudinary/url-gen';

// Inicializar Cloudinary
const cloudinary = new Cloudinary({
  cloud: {
    cloudName: process.env.REACT_APP_CLOUDINARY_CLOUD_NAME
  },
  url: {
    secure: true
  }
});

export default cloudinary;