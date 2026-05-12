import { codegenNativeComponent, type ViewProps } from 'react-native';

export interface NativeTemplateInterceptorProps extends ViewProps {}

export default codegenNativeComponent<NativeTemplateInterceptorProps>(
  'MGTemplateInterceptor',
);
