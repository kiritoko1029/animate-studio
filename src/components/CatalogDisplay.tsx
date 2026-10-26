import { officialClass, officialStyle } from '../lib/official-motion';
import { useOfficialOpen } from './useOfficialOpen';
import { useContext, useEffect, useState } from 'react';
import { Star, Heart } from 'lucide-react';
import { AvatarGroup, AvatarGroupTooltip, AvatarGroupTooltipArrow } from '@animate-ui/react/primitives/avatar-group';
import { GithubStars, GithubStarsLogo, GithubStarsNumber, GithubStarsIcon, GithubStarsParticles } from '@animate-ui/react/primitives/github-stars';
import { PreviewLinkCard, PreviewLinkCardTrigger, PreviewLinkCardPortal, PreviewLinkCardContent, PreviewLinkCardImage } from '@animate-ui/react/primitives/radix-ui/preview-link-card';
import { GitHubStarsButton, GitHubStarsButtonLogo, GitHubStarsButtonIcon, GitHubStarsButtonNumber, GitHubStarsButtonParticles } from './animate-ui/registry/buttons/github-stars';
import { PageBlockTheme } from './PagePreviewTheme';
import { usePageImage } from './PageAssets';
import { motionProps, anchoredProps } from '../lib/official-motion';
import { safeUrl, type Block } from '../model';
import { usePageLinks } from '../lib/navigation';

export function CatalogAvatars({block}:{block:Block}) {
 const theme=useContext(PageBlockTheme);
 const people=(block.props.items || '').split('\n').filter(Boolean).map(row=>row.split('|'));
 return <><AvatarGroup {...motionProps<typeof AvatarGroup>(block,'AvatarGroup')} className={officialClass("native-catalog-avatars", (motionProps<typeof AvatarGroup>(block,'AvatarGroup')).className)}>{people.map(([name,src],i)=><div key={i}><span className="native-avatar" aria-label={name}>{src && safeUrl(src)!=='#' ? <img src={safeUrl(src)} alt={name}/> : Array.from(name).slice(0,2).join('')}</span><AvatarGroupTooltip {...motionProps<typeof AvatarGroupTooltip>(block,'AvatarGroupTooltip')} className={officialClass("native-avatar-tooltip", (motionProps<typeof AvatarGroupTooltip>(block,'AvatarGroupTooltip')).className)} data-page-scheme={theme?.colorScheme} style={officialStyle(theme, (motionProps<typeof AvatarGroupTooltip>(block,'AvatarGroupTooltip')).style)}>{name}<AvatarGroupTooltipArrow {...motionProps<typeof AvatarGroupTooltipArrow>(block,'AvatarGroupTooltipArrow')} className={officialClass("native-avatar-arrow", (motionProps<typeof AvatarGroupTooltipArrow>(block,'AvatarGroupTooltipArrow')).className)}/></AvatarGroupTooltip></div>)}</AvatarGroup>{block.props.label && <p>{block.props.label}</p>}</>;
}
export function CatalogStars({block}:{block:Block}) {
 const { navigate } = usePageLinks();
 const p=block.props;
 const options=motionProps<typeof GithubStars>(block,block.type==='githubStarsButton'?'GitHubStarsButton':'GithubStars');
 const starProps=motionProps<typeof GithubStarsIcon<'svg'>>(block,block.type==='githubStarsButton'?'GitHubStarsButtonIcon':'GithubStarsIcon');
 const StarIcon=String(starProps.icon)==='heart'?Heart:Star;
 delete starProps.icon;
 const remote=Boolean(options.username&&options.repo);
 const star=<GithubStarsIcon width={18} height={18} color="#eab308" {...starProps} icon={StarIcon} className={officialClass('native-github-star-icon',starProps.className)}/>;
 if(block.type==='githubStarsButton')return <GitHubStarsButton {...motionProps<typeof GitHubStarsButton>(block,'GitHubStarsButton')} value={remote ? undefined : p.value ?? 0} aria-label={options['aria-label'] ?? p.title ?? p.label} onClick={event=>navigate(event,p.url)} className={officialClass("native-github-button",motionProps<typeof GitHubStarsButton>(block,'GitHubStarsButton').className)}><GitHubStarsButtonLogo width={16} height={16} {...motionProps<typeof GitHubStarsButtonLogo>(block,'GitHubStarsButtonLogo')}/><GitHubStarsButtonNumber {...motionProps<typeof GitHubStarsButtonNumber>(block,'GitHubStarsButtonNumber')}/><GitHubStarsButtonParticles {...motionProps<typeof GitHubStarsButtonParticles>(block,'GitHubStarsButtonParticles')} style={officialStyle({color:'#eab308'},motionProps<typeof GitHubStarsButtonParticles>(block,'GitHubStarsButtonParticles').style)}><GitHubStarsButtonIcon width={16} height={16} color="#eab308" {...starProps} icon={StarIcon}/></GitHubStarsButtonParticles></GitHubStarsButton>;
 return <GithubStars {...motionProps<typeof GithubStars>(block,'GithubStars')} value={remote ? undefined : p.value ?? 0} aria-label={options['aria-label'] ?? p.title ?? p.label} className={officialClass("native-github-stars",motionProps<typeof GithubStars>(block,'GithubStars').className)}><GithubStarsLogo width={24} height={24} {...motionProps<typeof GithubStarsLogo>(block,'GithubStarsLogo')}/><div className="native-github-count"><GithubStarsNumber {...motionProps<typeof GithubStarsNumber>(block,'GithubStarsNumber')}/><GithubStarsParticles {...motionProps<typeof GithubStarsParticles>(block,'GithubStarsParticles')} style={officialStyle({color:'#eab308'},motionProps<typeof GithubStarsParticles>(block,'GithubStarsParticles').style)}>{star}</GithubStarsParticles></div></GithubStars>;

}
export function CatalogLinkPreview({block}:{block:Block}) {
 const { navigate, safeUrl } = usePageLinks();
 const opening=useOfficialOpen(block,'PreviewLinkCard');
 const theme=useContext(PageBlockTheme);
 const options=motionProps<typeof PreviewLinkCard>(block,'PreviewLinkCard');
 const source=usePageImage(options.src || block.props.imageUrl);
 const fallback=usePageImage('/landscape.svg');
 const [failed,setFailed]=useState(false);
 const href=safeUrl(options.href ?? block.props.url);
 const src=source!=='#' ? source : /^https?:/.test(href) ? undefined : fallback;
 useEffect(()=>setFailed(false),[src,href]);
 return <PreviewLinkCard {...options} {...opening} href={href} src={src} colorScheme={options.colorScheme ?? (theme?.colorScheme === 'dark' ? 'dark' : 'light')}>
   <PreviewLinkCardTrigger {...motionProps<typeof PreviewLinkCardTrigger>(block,'PreviewLinkCardTrigger')} className={officialClass("as-page-catalog-button",motionProps<typeof PreviewLinkCardTrigger>(block,'PreviewLinkCardTrigger').className)} href={href} onClick={event=>navigate(event,href)}>{block.props.label || '预览链接'}</PreviewLinkCardTrigger>
   <PreviewLinkCardPortal {...motionProps<typeof PreviewLinkCardPortal>(block,'PreviewLinkCardPortal')}><PreviewLinkCardContent {...anchoredProps<typeof PreviewLinkCardContent>(block,'PreviewLinkCardPanel')} className={officialClass("native-link-preview native-catalog-portal", (anchoredProps<typeof PreviewLinkCardContent>(block,'PreviewLinkCardPanel')).className)} style={officialStyle(theme, (anchoredProps<typeof PreviewLinkCardContent>(block,'PreviewLinkCardPanel')).style)} data-page-scheme={theme?.colorScheme} onClick={event=>navigate(event,href)}>
    {failed ? <span className="native-link-preview-fallback">{block.props.title || href}</span> : <PreviewLinkCardImage {...motionProps<typeof PreviewLinkCardImage>(block,'PreviewLinkCardImage')} alt={motionProps<typeof PreviewLinkCardImage>(block,'PreviewLinkCardImage').alt ?? block.props.title ?? '链接预览'} onError={()=>setFailed(true)}/>}
   </PreviewLinkCardContent></PreviewLinkCardPortal>
 </PreviewLinkCard>;
}
