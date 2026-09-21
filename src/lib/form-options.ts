// Validate only after blur or submit, then update errors as the user corrects them.
export const formOptions = {
  mode: "onTouched",
  reValidateMode: "onChange",
  shouldFocusError: true,
} as const;
