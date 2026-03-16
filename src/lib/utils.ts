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