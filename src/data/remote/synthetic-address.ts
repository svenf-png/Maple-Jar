/**
 * Konstante Domain für die synthetische Anmeldeadresse `<benutzername>@<domain>`.
 * Es gibt keine echten E-Mail-Adressen. `.invalid` ist laut RFC 2606 reserviert und nie zustellbar.
 * Ungeprüft: ob die Adressvalidierung des Supabase-Projekts diese Domain akzeptiert. Falls nicht,
 * hier und beim Anlegen der Konten dieselbe Ersatzdomain verwenden.
 */
export const ADDRESS_DOMAIN = 'maple-jar.invalid';

export const syntheticAddress = (username: string): string => `${username}@${ADDRESS_DOMAIN}`;
