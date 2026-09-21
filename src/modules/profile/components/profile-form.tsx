"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { FormField, TextareaField } from "@/components/form-field";
import { DiscardChanges } from "@/components/discard-changes";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, Feedback, LoadingState } from "@/components/ui/feedback";
import { getApiErrorMessage } from "@/lib/axios";
import { formOptions } from "@/lib/form-options";
import { useProfile, useUpdateProfile } from "@/modules/profile/hooks/use-profile";
import { profileSchema, type ProfileFormData } from "@/modules/profile/schemas/profile.schema";

export function ProfileForm() {
  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const { register, handleSubmit, reset, formState: { errors, touchedFields, isSubmitted, isDirty } } = useForm<ProfileFormData>({
    ...formOptions, resolver: zodResolver(profileSchema),
    defaultValues: { name: "", bio: "", avatarUrl: "", githubUrl: "" },
  });

  useEffect(() => {
    if (profile.data) reset({ name: profile.data.name, bio: profile.data.bio ?? "", avatarUrl: profile.data.avatarUrl ?? "", githubUrl: profile.data.githubUrl ?? "" }, { keepDirtyValues: true });
  }, [profile.data, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setFeedback(null);
    try {
      await updateProfile.mutateAsync(values);
      reset(values);
      setFeedback({ message: "Perfil atualizado com sucesso." });
    } catch (error) {
      setFeedback({ message: getApiErrorMessage(error, "Não foi possível salvar o perfil. Suas alterações foram mantidas; tente novamente."), error: true });
    }
  });

  return (
    <div className="max-w-2xl space-y-8">
      <PageHeading eyebrow="Configurações" title="Perfil" description="Mantenha suas informações de desenvolvedor atualizadas." />
      {profile.isLoading ? <LoadingState label="Carregando perfil..." /> :
      profile.isError || !profile.data ? <ErrorState message="Não foi possível carregar o perfil." pending={profile.isFetching} retry={() => void profile.refetch()} /> :
      <Card><CardHeader><CardTitle>Dados pessoais</CardTitle></CardHeader><CardContent>
        <form onSubmit={onSubmit} onChange={() => setFeedback(null)} aria-busy={updateProfile.isPending} noValidate>
          <fieldset disabled={updateProfile.isPending} className="min-w-0 space-y-5">
            <FormField id="name" label="Nome" autoComplete="name" hint="Use pelo menos 2 caracteres." error={touchedFields.name || isSubmitted ? errors.name?.message : undefined} {...register("name")} />
            <FormField id="email" label="E-mail" value={profile.data.email} readOnly hint="O e-mail não pode ser alterado nesta tela." />
            <TextareaField id="bio" label="Sobre você (opcional)" rows={4} hint="Conte um pouco sobre seu trabalho. Máximo de 240 caracteres." error={touchedFields.bio || isSubmitted ? errors.bio?.message : undefined} {...register("bio")} />
            <FormField id="avatarUrl" label="Link da foto de perfil (opcional)" type="url" placeholder="https://exemplo.com/foto.png" hint="Informe o endereço completo da imagem, incluindo https://." error={touchedFields.avatarUrl || isSubmitted ? errors.avatarUrl?.message : undefined} {...register("avatarUrl")} />
            <FormField id="githubUrl" label="GitHub (opcional)" type="url" placeholder="https://github.com/seu-usuario" error={touchedFields.githubUrl || isSubmitted ? errors.githubUrl?.message : undefined} {...register("githubUrl")} />
            {feedback && <Feedback error={feedback.error}>{feedback.message}</Feedback>}
            <div className="flex flex-wrap items-start gap-3">
              <Button type="submit" loading={updateProfile.isPending} loadingText="Salvando...">Salvar alterações</Button>
              <DiscardChanges disabled={!isDirty || updateProfile.isPending} onConfirm={() => { reset(); setFeedback(null); }} />
            </div>
          </fieldset>
        </form>
      </CardContent></Card>}
    </div>
  );
}
