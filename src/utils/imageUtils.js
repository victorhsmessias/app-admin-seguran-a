/**
 * Transforma uma URL do Cloudinary para aplicar parâmetros
 * @param {string} originalUrl - URL original da imagem
 * @param {Object} options - Opções de transformação
 * @returns {string} - URL transformada
 */
export const transformCloudinaryUrl = (originalUrl, options = {}) => {
    if (!originalUrl || !originalUrl.includes('cloudinary.com')) {
      return originalUrl;
    }
    
    // Valores padrão
    const defaults = {
      width: null,
      height: null,
      crop: null,
      quality: null,
      face: false,
      zoom: null
    };
    
    const params = { ...defaults, ...options };
    
    // Localiza a parte da URL onde inserir as transformações
    const uploadPosition = originalUrl.indexOf('/upload/');
    if (uploadPosition === -1) return originalUrl;
    
    // Constrói a string de transformação
    let transformation = '';
    
    if (params.width) transformation += `w_${params.width},`;
    if (params.height) transformation += `h_${params.height},`;
    if (params.crop) transformation += `c_${params.crop},`;
    if (params.quality) transformation += `q_${params.quality},`;
    if (params.face) transformation += `c_face,`;
    if (params.zoom) transformation += `z_${params.zoom},`;
    
    // Remove a vírgula final se existir
    if (transformation.endsWith(',')) {
      transformation = transformation.slice(0, -1);
    }
    
    // Se não houver transformações, retorna a URL original
    if (!transformation) return originalUrl;
    
    // Insere a transformação na URL
    const transformedUrl = originalUrl.slice(0, uploadPosition + 8) + transformation + '/' + originalUrl.slice(uploadPosition + 8);
    return transformedUrl;
  };
  
  /**
   * Retorna a URL de uma miniatura para lista
   * @param {string} url - URL original da imagem
   * @returns {string} - URL da miniatura
   */
  export const getThumbnailUrl = (url) => {
    return transformCloudinaryUrl(url, {
      width: 100,
      height: 100,
      crop: 'fill',
      quality: 'auto'
    });
  };
  
  /**
   * Retorna a URL otimizada para avatar/foto de perfil
   * @param {string} url - URL original da imagem
   * @returns {string} - URL do avatar
   */
  export const getAvatarUrl = (url) => {
    return transformCloudinaryUrl(url, {
      width: 150,
      height: 150,
      crop: 'fill',
      face: true
    });
  };
  
  /**
   * Retorna a URL para visualização em modal
   * @param {string} url - URL original da imagem
   * @returns {string} - URL para visualização
   */
  export const getModalViewUrl = (url) => {
    return transformCloudinaryUrl(url, {
      width: 800,
      quality: 'auto'
    });
  };