/** Mercado Pago habilitado para cobros del club (OAuth o token guardado en el tenant). */
export async function isClubMercadoPagoLinked(models) {
    const { ClubSettings } = models;
    const doc = await ClubSettings.findOne().select('mercadopagoAccessToken').lean();
    return !!doc?.mercadopagoAccessToken?.trim();
}
