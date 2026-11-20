"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

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
import { AvatarUpload } from "./avatar-upload";
import { ProfilePreview } from "./profile-preview";

export function ProfileForm() {
  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const { register, handleSubmit, reset, control, formState: { errors, touchedFields, isSubmitted, isDirty } } = useForm<ProfileFormData>({
    ...formOptions, resolver: zodResolver(profileSchema),
    defaultValues: { name: "", bio: "", githubUrl: "" },
  });

  const [name = "", bio = "", githubUrl = ""] = useWatch({ control, name: ["name", "bio", "githubUrl"] });

  useEffect(() => {
    if (profile.data) reset({ name: profile.data.name, bio: profile.data.bio ?? "", githubUrl: profile.data.githubUrl ?? "" }, { keepDirtyValues: true });
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
    <div className="space-y-8">
      <PageHeading eyebrow="Configurações" title="Perfil" description="Mantenha suas informações de desenvolvedor atualizadas." />
      {profile.isLoading ? <LoadingState label="Carregando perfil..." /> :
      profile.isError || !profile.data ? <ErrorState message="Não foi possível carregar o perfil." pending={profile.isFetching} retry={() => void profile.refetch()} /> :
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,42rem)_340px] xl:gap-8">
      <Card className="min-w-0"><CardHeader><CardTitle>Dados pessoais</CardTitle></CardHeader><CardContent className="space-y-6">
        <AvatarUpload profile={profile.data} />
        <form method="post" onSubmit={onSubmit} onChange={() => setFeedback(null)} aria-busy={updateProfile.isPending} noValidate>
          <fieldset disabled={updateProfile.isPending} className="min-w-0 space-y-5">
            <FormField id="name" label="Nome" autoComplete="name" hint="Use pelo menos 2 caracteres." error={touchedFields.name || isSubmitted ? errors.name?.message : undefined} {...register("name")} />
            <FormField id="email" label="E-mail" value={profile.data.email} readOnly hint="O e-mail não pode ser alterado nesta tela." />
            <TextareaField id="bio" label="Sobre você (opcional)" rows={4} hint="Conte um pouco sobre seu trabalho. Máximo de 240 caracteres." error={touchedFields.bio || isSubmitted ? errors.bio?.message : undefined} {...register("bio")} />
            <FormField id="githubUrl" label="GitHub (opcional)" type="url" placeholder="https://github.com/seu-usuario" error={touchedFields.githubUrl || isSubmitted ? errors.githubUrl?.message : undefined} {...register("githubUrl")} />
            {feedback && <Feedback error={feedback.error}>{feedback.message}</Feedback>}
            <div className="flex flex-wrap items-start gap-3">
              <Button type="submit" loading={updateProfile.isPending} loadingText="Salvando...">Salvar alterações</Button>
              <DiscardChanges disabled={!isDirty || updateProfile.isPending} onConfirm={() => { reset(); setFeedback(null); }} />
            </div>
          </fieldset>
        </form>
      </CardContent></Card>
      <aside aria-label="Prévia do perfil" className="min-w-0 lg:sticky lg:top-8"><ProfilePreview name={name} bio={bio} githubUrl={githubUrl} avatarUrl={profile.data.avatarUrl} /></aside>
      </div>}
    </div>
  );
}
