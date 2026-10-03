# Falha ao baixar imagem (ImagePullBackOff)

Diagnóstico de pods com erro `ImagePullBackOff` ou `ErrImagePull`. As causas frequentes são: tag de imagem incorreta ou inexistente no container registry, repositório privado sem credencial (`imagePullSecrets`) ou bloqueio de rede/firewall com o registry.

### Parâmetros
- `namespace`: Namespace da aplicação
- `app`: Label da aplicação
- `pod`: Nome do pod com erro de imagem
- `deployment`: Nome do deployment associado

### Procedimento

1. Liste os pods no namespace com endereço do nó e status detalhado:
```bash
kubectl get pods -n {{namespace}} -o wide
```

2. Inspecione a mensagem detalhada emitida pelo kubelet na seção de eventos:
```bash
kubectl describe pod {{pod}} -n {{namespace}}
```

3. Filtre os eventos específicos deste pod para ver o histórico de tentativas de download:
```bash
kubectl get events -n {{namespace}} --field-selector involvedObject.name={{pod}}
```

4. Verifique a imagem, tag e imagePullSecrets declarados no Deployment:
```bash
kubectl get deployment {{deployment}} -n {{namespace}} -o yaml
```

5. Após corrigir a tag no pipeline ou liberar o registry, force um novo rollout do deployment:
```bash
kubectl rollout restart deployment/{{deployment}} -n {{namespace}}
```
