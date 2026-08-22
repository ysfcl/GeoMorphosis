export const formatDate = (date) => {
  return new Date(date).toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const normalizeRiskValue = (risk) => {
  return typeof risk === 'string'
    ? risk.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    : '';
};

export const getRiskColor = (risk) => {
  switch (normalizeRiskValue(risk)) {
    case 'yuksek':
    case 'high':
      return 'text-red-600 bg-red-50';
    case 'orta':
    case 'medium':
      return 'text-yellow-600 bg-yellow-50';
    case 'dusuk':
    case 'low':
      return 'text-green-600 bg-green-50';
    default:
      return 'text-gray-600 bg-gray-50';
  }
};
