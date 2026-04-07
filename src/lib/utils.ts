export const formatPhoneLink = (phone: string) => {
    // Strip spaces, dashes, brackets for clean tel: link
    const cleaned = phone.replace(/[\s\-\(\)]/g, '')
    return `tel:${cleaned}`
  }

export const formatEmailLink = (email: string) => {
    return `mailto:${email}`
  }

  export const formatMapsLink = (address: string) => {
    const encoded = encodeURIComponent(address)
    // This works on both Android (Google Maps) and iPhone (Apple Maps)
    return `https://maps.google.com/maps?q=${encoded}`
  }

export function generateBatchNumber(date: Date = new Date(), seq: number = 1): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `BATCH-${y}${m}${d}-${String(seq).padStart(3, "0")}`;
}