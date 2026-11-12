/** Detalhes de validação devolvidos em respostas 400. */
export type ApiValidationDetails = {
  formErrors: string[];
  fieldErrors: Partial<Record<string, string[]>>;
};

/** Corpo padrão de toda resposta de erro (4xx/5xx) da API. */
export type ApiErrorResponse = {
  message: string;
  details?: ApiValidationDetails;
};
