Pod::Spec.new do |s|
  s.name           = 'FoldState'
  s.version        = '1.0.0'
  s.summary        = 'Hinge status for OpenTV on iPhone Duo'
  s.description    = 'Tells the app whether an iPhone Duo is closed, half open or flat.'
  s.author         = 'Insightfy LLC'
  s.homepage       = 'https://github.com/insightfy/opentv'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,swift}'
end
