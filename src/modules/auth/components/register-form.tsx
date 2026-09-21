"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Feedback } from "@/components/ui/feedback";
import { formOptions } from "@/lib/form-options";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/axios";
import { useRegisterMutation } from "@/modules/auth/hooks/use-auth";
import { registerSchema, type RegisterFormData } from "@/modules/auth/schemas/register.schema";

export function RegisterForm() {
  const router = useRouter();
  const registerMutation = useRegisterMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<RegisterFormData>({
    ...formOptions,
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", passwordConfirmation: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await registerMutation.mutateAsync({ name: values.name, email: values.email, password: values.password });
      router.replace("/dashboard");
    } catch (error) {
      setServerError(getApiErrorMessage(error, "Não foi possível criar a conta. Verifique sua conexão e tente novamente."));
    }
  });

  return (
    <form onSubmit={onSubmit} onChange={() => setServerError(null)} aria-busy={registerMutation.isPending} noValidate>
      <fieldset className="min-w-0 space-y-5" disabled={registerMutation.isPending}>
      <FormField id="name" autoFocus label="Nome" hint="Use pelo menos 2 caracteres." autoComplete="name" error={errors.name?.message} {...register("name")} />
      <FormField id="email" label="E-mail" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
      <FormField id="password" label="Senha" hint="Use pelo menos 8 caracteres." type="password" autoComplete="new-password" error={errors.password?.message} {...register("password")} />
      <FormField id="passwordConfirmation" label="Confirme a senha" hint="Digite novamente a senha escolhida." type="password" autoComplete="new-password" error={errors.passwordConfirmation?.message} {...register("passwordConfirmation")} />
      {serverError ? <Feedback error>{serverError}</Feedback> : null}
      <Button type="submit" className="w-full" loading={registerMutation.isPending} loadingText="Criando conta...">Criar conta</Button>
    </fieldset>
    </form>
  );
}
