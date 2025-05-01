export const getAddressFromCoordinates = async (latitude, longitude) => {
    try {
      // É importante adicionar um User-Agent conforme as regras do Nominatim
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'SeuAppNome/1.0' // Substitua pelo nome do seu aplicativo
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