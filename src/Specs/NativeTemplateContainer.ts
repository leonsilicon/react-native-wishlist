import { codegenNativeComponent, type ViewProps } from 'react-native';

export interface NativeTemplateContainerProps extends ViewProps {
  inflatorId: string;
  wishlistId: string;
  names: string;
}

export default codegenNativeComponent<NativeTemplateContainerProps>(
  'MGTemplateContainer',
  { interfaceOnly: true },
);
