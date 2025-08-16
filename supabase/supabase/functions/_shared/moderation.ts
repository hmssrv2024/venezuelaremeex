// Lista básica de palabras prohibidas (expandir según necesidades)
const PROHIBITED_WORDS = [
  'spam', 'malware', 'phishing', 'hack', 'virus'
];

// Lista de dominios sospechosos
const SUSPICIOUS_DOMAINS = [
  'bit.ly', 'tinyurl.com', 'goo.gl'
];

export function moderateContent(content: string): { allowed: boolean; reason?: string } {
  const lowerContent = content.toLowerCase();
  
  // Verificar palabras prohibidas
  for (const word of PROHIBITED_WORDS) {
    if (lowerContent.includes(word)) {
      return {
        allowed: false,
        reason: `Contenido bloqueado: contiene término prohibido "${word}"`
      };
    }
  }
  
  // Verificar dominios sospechosos
  for (const domain of SUSPICIOUS_DOMAINS) {
    if (lowerContent.includes(domain)) {
      return {
        allowed: false,
        reason: `Contenido bloqueado: contiene dominio sospechoso "${domain}"`
      };
    }
  }
  
  // Verificar longitud excesiva
  if (content.length > 10000) {
    return {
      allowed: false,
      reason: 'Contenido bloqueado: longitud excesiva'
    };
  }
  
  // Verificar repetición excesiva de caracteres
  const repeatedPattern = /(..)\1{10,}/;
  if (repeatedPattern.test(content)) {
    return {
      allowed: false,
      reason: 'Contenido bloqueado: patrón repetitivo detectado'
    };
  }
  
  return { allowed: true };
}

export function validateFileUpload(fileName: string, mimeType: string, sizeBytes: number): { allowed: boolean; reason?: string } {
  const maxSizeMB = parseInt(Deno.env.get('MAX_FILE_SIZE_MB') || '15');
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  
  // Verificar tamaño
  if (sizeBytes > maxSizeBytes) {
    return {
      allowed: false,
      reason: `Archivo demasiado grande: ${(sizeBytes / 1024 / 1024).toFixed(1)}MB, máximo ${maxSizeMB}MB`
    };
  }
  
  // Tipos MIME permitidos
  const allowedMimeTypes = [
    // Imágenes
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    // Audio
    'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/mp4',
    // Documentos
    'application/pdf', 'text/plain', 'text/markdown',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  if (!allowedMimeTypes.includes(mimeType)) {
    return {
      allowed: false,
      reason: `Tipo de archivo no permitido: ${mimeType}`
    };
  }
  
  // Verificar extensiones sospechosas
  const suspiciousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.vbs', '.js'];
  const lowercaseFileName = fileName.toLowerCase();
  
  for (const ext of suspiciousExtensions) {
    if (lowercaseFileName.endsWith(ext)) {
      return {
        allowed: false,
        reason: `Extensión de archivo no permitida: ${ext}`
      };
    }
  }
  
  return { allowed: true };
}