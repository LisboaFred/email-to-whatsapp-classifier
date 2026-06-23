# AI Email Triage + WhatsApp Automation

Sistema de triagem inteligente de e-mails que monitora uma caixa de entrada via IMAP, classifica mensagens com Gemini/LLM por prioridade e envia resumos executivos via WhatsApp.

## Problema

Executivos e equipes recebem muitos e-mails diariamente, misturando mensagens críticas, demandas operacionais, notificações automáticas, marketing e spam. Isso aumenta o risco de perder prazos, aprovações, contratos, cobranças ou solicitações importantes.

## Solução

A aplicação automatiza a leitura da caixa de entrada, interpreta o conteúdo dos e-mails com IA generativa, classifica cada mensagem por prioridade e organiza os e-mails em pastas específicas. Quando um e-mail é classificado como muito importante, ele entra em uma fila de resumo para envio via WhatsApp.

## Principais funcionalidades

• Monitoramento de e-mails via IMAP  
• Classificação automática com Gemini API  
• Prompt estruturado para triagem executiva  
• Resposta padronizada em JSON  
• Normalização de prioridade, risco e ação necessária  
• Separação em pastas: spam, muito importante, importante e pouco importante  
• Fila de e-mails muito importantes para WhatsApp  
• Envio de resumo via WhatsApp API  
• Controle de horários de envio  
• Retry automático para falhas temporárias da API Gemini  
• Configuração por `.env` e `config.json`

## Stack

• TypeScript  
• Node.js  
• Gemini API  
• IMAP / ImapFlow  
• MailParser  
• WhatsApp Cloud API  
• Axios  
• dotenv  
• tsx
