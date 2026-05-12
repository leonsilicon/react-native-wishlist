import { codegenNativeComponent, type ViewProps } from 'react-native';

export interface NativeContentContainerProps extends ViewProps {}

export default codegenNativeComponent<NativeContentContainerProps>(
  'MGContentContainer',
  { interfaceOnly: true },
);
