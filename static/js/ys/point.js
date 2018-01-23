import React from 'react';
import ReactDOM from 'react-dom';
import { graphql, compose } from 'react-apollo';
import gql from 'graphql-tag';
import { Form, Text } from 'react-form';

const CurrentUserQuery = gql`
query CurrentUser {
  currentUser { url }
}`

export const pointFieldsFragment = gql`
fragment pointFields on Point {
  id,
  url,
  title,
  authorName,
  authorURL,
  imageURL,
  fullPointImage,
  upVotes,
  downVotes,
  pointValue,
  numSupporting,
  numCounter,
  numComments,
  supportedCount,
  sources {url, name},
  rootURLsafe,
  currentUserVote
}
`

export const expandedPointFieldsFragment = gql`
${pointFieldsFragment}
fragment evidenceFields on Point {
 supportingPoints { edges { node { title, upVotes, ...pointFields }, link { id, type, relevance, parentURLsafe, childURLsafe }} },
 counterPoints { edges { node { title, upVotes, ...pointFields }, link { id, type, relevance, parentURLsafe, childURLsafe }} }
}`

export const EvidenceType = Object.freeze({
    ROOT: Symbol("root"),
    SUPPORT:  Symbol("supporting"),
    COUNTER: Symbol("counter")
});

function Byline(props){
  return <span className="cardTopRowItem"><span>By </span><a className="byline" target="_blank" tabIndex="-1" href={"/user/" + props.point.authorURL}>@{props.point.authorName}</a></span>
}

// TODO: should we localize these icons instead of relying on fontawesome (the fa class)? -JF
function CommentCount(props){
  return <span className="cardTopRowItem"><span className="iconWithStat fa fa-comment-o"></span>{props.point.numComments}</span>
}
function ShareIcon(props){
  return <span className="cardTopRowItem"><span className="fa fa-share-alt"></span></span>
}
function SupportingCount(props){
  return <span className="cardTopRowItem"><span className="iconWithStat fa fa-level-up"></span>{props.point.supportedCount}</span>
}

// Currently unused; moreMenu currently being generated via a local function within PointCard()
function MoreMenu(props) {
  return <span className="cardTopRowItem dropdown">
    <a className="moreMenu dropdown-toggle"  data-toggle="dropdown">&#9776;</a>
    <ul id="" className="dropdown-menu" role="menu" aria-labelledby="dropdownMenu">
      <li>More Actions</li>
      <li className="divider"></li>
      <li>
        <span className=""><span className="iconWithStat fa fa-level-up"></span>{props.point.supportedCount} Upstream Points</span>
       </li>
       <li className="divider"></li>
       <li><a onClick={props.point.handleClickEdit} className="" >Edit</a></li>
    </ul>
  </span>
}
/*
        Code to check if current user is the point Author
          {this.props.data.currentUser &&
          this.props.data.currentUser.url == this.point.authorURL &&
          <a onClick={this.handleClickEdit} className="editLink" >Edit</a>}
*/


// thanks, https://stackoverflow.com/questions/29981236/how-do-you-hover-in-reactjs-onmouseleave-not-registered-during-fast-hover-ove
const Hover = ({ onHover, children }) => (
    <span className="hover bringToFront">
      <span className="hover__no-hover">{children}</span>
      <span className="hover__hover">{onHover}</span>
    </span>
)

const VoteStats = ({point}) => (
    <div className="vote-stats">
      <p>
        {point.upVotes} Agrees<br/>
        {point.downVotes} Disagrees<br/>
      </p>
      <div className="menuDivider"></div>
      <p>
        {point.numSupporting} Supporting Claim{point.numSupporting != 1 ? "s" : null}<br/>
        {point.numCounter} Counter Claim{point.numCounter != 1 ? "s" : null}<br/>
      </p>
    </div>
)

export const EditPointQuery = gql`
mutation EditPoint($url: String!, $title: String) {
  editPoint(pointData: {url: $url, title: $title}) {
    point {
      id,
      title,
      url
    }
  }
}
`

const EditTitleForm = ( props ) => {
  return (
      <Form onSubmit={props.onSubmit}>
      { formApi => (
          <form onSubmit={formApi.submitForm} id="form1">
          <Text field="title" id="title" />
          <button type="submit">Save</button>
          </form>
      )}
    </Form>
  );
}

class PointComponent extends React.Component {
  constructor(props) {
    super(props)
    this.state = {editing: false}
    this.handleClickEdit = this.handleClickEdit.bind(this);
    this.handleClickSave = this.handleClickSave.bind(this);
    this.handleToggleEvidence = this.handleToggleEvidence.bind(this);
  }

  get point() {
    return this.props.point;
  }

  handleClickEdit(e) {
    console.log("edit");
    this.setState({editing: true})
  }

  handleClickSave(values, e, formApi) {
    console.log("saving edits")
    values.url = this.point.url
    this.setState({saving: true})
    this.props.mutate({
      variables: values
    })
    // this component will be replaced after save, so we don't need to update state
  }

  handleToggleEvidence() {
    console.log("PointComponent : toggle evidence!")
    this.props.onClick && this.props.onClick()
  }

  titleUI() {
    if (this.state.editing) {
      if (this.state.saving) {
        return <span>Saving...</span>
      } else {
        return <span>
            <EditTitleForm onSubmit={this.handleClickSave}/>
          </span>
      }
    } else {
      return <span className="pointTitle">
        <a tabIndex="-1" onClick={this.handleToggleEvidence}>{this.point.title}</a>
        </span>

    /* OLD CODE FOR EDITING POINT TITLES: */
      /*return <span className="pointTitle">
        <a href={this.point.url}>{this.point.title}</a>
    {this.props.data.currentUser &&
        this.props.data.currentUser.url == this.point.authorURL &&
        <a onClick={this.handleClickEdit} className="editLink" >edit</a>}
        </span> */
    }
  }

  render(){
    const score = this.point.pointValue
    return <div>
      {this.titleUI()}
    <span className="scoreAnimContainerMax">
    <span className="scoreAnimContainerReset">
      <Hover onHover={<VoteStats point={this.point}/>}>
      <span className="ux2ScoreInLine"><span className="positiveScore">{score > 0 && "+"}{score}</span></span>
      </Hover>
    </span>
    </span>
      </div>
  }
}

const Point = compose(
  graphql(EditPointQuery),
  graphql(CurrentUserQuery),
)(PointComponent)

class Sources extends React.Component {
  constructor(props) {
    super(props)
    this.state = {editing: false}
    this.handleClickEdit = this.handleClickEdit.bind(this);
    this.handleClickSave = this.handleClickSave.bind(this);
  }

  get point() {
    return this.props.point;
  }

  handleClickEdit(e) {
    // TODO: not working, make work
    console.log("edit");
    this.setState({editing: true})
  }

  handleClickSave(values, e, formApi) {
    // TODO: not working, make work
    console.log("saving edits")
    values.url = this.point.url
    this.props.mutate({
      variables: values
    })
      .then( res => {
        console.log(res)
      });
    this.setState({editing: false})
  }

  render(){
    return <div className="sources">
      {this.point.sources && this.point.sources.map(({name, url}, i) =>
        <div key={i} className="source"><img className="iconSourcesSmall" src="/static/img/sourcesIconSmall_grey.png"/><a tabIndex="-1" href={url}>{name}</a></div>
      )}
    </div>
  }
}

class EvidenceLink extends React.Component {
  constructor(props) {
    super(props)
    this.handleClickSee = this.handleClickSee.bind(this);
    this.handleClickHide = this.handleClickHide.bind(this);
    this.handleClickToggle = this.handleClickToggle.bind(this);
  }

  get point() {
    return this.props.point;
  }

  hasEvidence() {
    return this.point.numSupporting > 0 || this.point.numCounter > 0;
  }

  // TODO: can this be replaced by handleClickToggle? -JF
  handleClickSee(e) {
    console.log("see");
    this.props.onSee && this.props.onSee()
  }

  // TODO: can this be replaced by handleClickToggle? -JF
  handleClickHide(e) {
    console.log("hide");
    this.props.onHide && this.props.onHide()
  }

  handleClickToggle() {
    console.log("toggle");
    this.props.onToggle && this.props.onToggle()
  }

  whichEvidenceButton() {
    if (this.hasEvidence()) {
      if (this.props.expanded) {
        return <a className="cardBottomAction hideEvidence" onClick={this.handleClickHide}>Hide Evidence</a>
      } else {
        return <a className="cardBottomAction seeEvidence" onClick={this.handleClickSee}>See Evidence</a>
      }
    } else {
      return <a className="cardBottomAction" onClick={this.handleClickToggle}>Add Evidence</a>
    }
  }

  render(){
  return <span className="evidenceContainer">{this.whichEvidenceButton()}</span>
  }
}

const AddEvidenceForm = ( props ) => {
  return (
    <div className="addEvidenceFormGroup">
    <div className="arrowAddEvidenceForm">↓</div>
      <Form onSubmit={props.onSubmit}>
      { formApi => (
          <form onSubmit={formApi.submitForm} id="form1" className="addEvidenceForm">
          <Text field="title" id="title" className="addEvidenceFormTextField" placeholder='Make a claim, eg "Some dinosaurs had feathers."' />
          <button type="submit" className="addEvidenceFormButton">Add</button>
          </form>
      )}
    </Form>
  </div>
  );
}

class AddEvidenceCard extends React.Component {
  constructor(props) {
    super(props)
    this.state = {adding: false}
    this.handleClickAddEvidence = this.handleClickAddEvidence.bind(this)
    this.handleClickSave = this.handleClickSave.bind(this)
  }

  get point() {
    return this.props.point;
  }

  handleClickAddEvidence(e) {
    console.log("add evidence")
    if (this.props.data.currentUser){
      this.setState({adding: true})
    } else {
      $("#loginDialog").modal("show");
    }
  }

  handleClickSave(values, e, formApi) {
    console.log("saving evidence")
    values.parentURL = this.point.url
    values.linkType = this.linkType
    this.setState({saving: true})
    this.props.mutate({
      variables: values
    })
      .then( res => {
        this.setState({saving: false,
                       adding: false})
        console.log(res)
      });
  }

  get evidenceType(){
    return this.props.type
  }

  get linkType(){
    switch (this.evidenceType) {
      case EvidenceType.SUPPORT:
        return "supporting"
      case EvidenceType.COUNTER:
        return "counter"
      default:
        return null
    }
  }

  get addText(){
    switch (this.evidenceType){
      case EvidenceType.ROOT:
        return "Add Evidence"
      case EvidenceType.SUPPORT:
        return "Add Evidence For"
      case EvidenceType.COUNTER:
        return "Add Evidence Against";
      default:
        return "Add Evidence"
    }
  }

  // TODO: this is declared as a local function in two different componants - should it be a global fuction or a const? -JF
  numSupportingPlusCounter(){
    return ( this.point.numSupporting + this.point.numCounter)
  }

  render(){
    if (this.state.adding) {
      if (this.state.saving) {
        return <div>
          Saving...
          </div>
      } else {
        return <div>
          <AddEvidenceForm onSubmit={this.handleClickSave}/>
          </div>
      }
    } else {
    let classesButton = `addEvidenceButtonGrp ${this.linkType=="counter" ? "addEvidenceButtonGrpCounter" : "" }`
    // TODO: the dashed line should not be present (or just hidden) if there are zero claims in the evidence list above it
    let classesLine = `dottedLine dottedLineAddEvidenceButton ${this.linkType=="counter" ? "dottedLineAddCounter" : "dottedLineAddSupport" }  ${this.numSupportingPlusCounter() < 1 ? "dottedLineNoEvidence" : "" }`
        return <a onClick={this.handleClickAddEvidence}>
        <div className={classesButton}>
          <div className={classesLine}></div>
          <div className="arrowAddEvidenceButton">▼</div>
          <div className="buttonBlack addEvidenceButton">{this.addText}</div>
        </div>
         </a>
    }
  }
}

export const AddEvidenceQuery = gql`
${expandedPointFieldsFragment}
mutation AddEvidence($title: String!, $linkType: String, $parentURL: String, $imageURL: String, $imageAuthor: String, $imageDescription: String, $sourceURLs: [String], $sourceNames: [String]) {
  addEvidence(pointData: {title: $title, content: $title, summaryText: $title, imageURL: $imageURL, imageAuthor: $imageAuthor, imageDescription: $imageDescription, sourceURLs: $sourceURLs, sourceNames: $sourceNames, linkType: $linkType, parentURL: $parentURL}) {
    point {
    ...pointFields,
    ...evidenceFields
    }
  }
}
`

const AddEvidence = compose(
  graphql(AddEvidenceQuery),
  graphql(CurrentUserQuery),
)(AddEvidenceCard)

export const VoteQuery = gql`
mutation Vote($url: String!, $vote: Int!, $parentURL: String) {
  vote(url: $url, vote: $vote, parentURL: $parentURL) {
    point {
      id
      pointValue
      upVotes
      downVotes
      currentUserVote
    }
    parentPoint {
      id
      pointValue
    }
  }
}
`

class AgreeDisagreeComponent extends React.Component {
  constructor(props) {
    super(props);
    // This binding is necessary to make `this` work in the callback
    this.handleClickAgree = this.handleClickAgree.bind(this);
    this.handleClickDisagree = this.handleClickDisagree.bind(this);
  }

  // move focus to the next point card, uses tabbable.js plugin
  focusOnNextCard() {
    setTimeout(function () { $.tabNext() } , 900)
  }

  handleClickAgree() {
    console.log("agree");
    if (this.props.data.currentUser){
      this.props.mutate({
        variables: {url: this.props.point.url,
                    vote: 1,
                    parentURL: this.props.parentPoint && this.props.parentPoint.url}
      }).then( res => {
        console.log(res)
      });
    this.focusOnNextCard()
    } else {
      $("#loginDialog").modal("show");
    }
  }

  handleClickDisagree() {
    console.log("disagree");
    if (this.props.data.currentUser){
      this.props.mutate({
        variables: {url: this.props.point.url,
                    vote: -1,
                    parentURL: this.props.parentPoint && this.props.parentPoint.url}
      }).then( res => {
        console.log(res)
      });
    this.focusOnNextCard()
    } else {
      $("#loginDialog").modal("show");
    }
  }

  agreeClass(){
    return "cardBottomAction agree" + (this.props.point.currentUserVote == 1 ? " current-vote" : "")
  }

  disagreeClass(){
    return "cardBottomAction disagree" + (this.props.point.currentUserVote == -1 ? " current-vote" : "")
  }

  render(){
    return <span>
      <a className={this.agreeClass()} onClick={this.handleClickAgree}>Agree</a>
      <a className={this.disagreeClass()} onClick={this.handleClickDisagree}>Disagree</a>
      </span>
    }
}

const AgreeDisagree = compose(
  graphql(VoteQuery),
  graphql(CurrentUserQuery),
)(AgreeDisagreeComponent)


export const RelevanceVoteQuery = gql`
mutation RelevanceVote($linkType: String!, $parentRootURLsafe: String!, $rootURLsafe: String!, $url: String!, $vote: Int!) {
  relevanceVote(linkType: $linkType, rootURLsafe: $rootURLsafe, parentRootURLsafe: $parentRootURLsafe, url: $url, vote: $vote) {
    point {
      id
    }

    link {
      id,
      type,
      relevance,
      parentURLsafe,
      childURLsafe
    }
  }
}
`

class RelevanceComponent extends React.Component {
  constructor(props) {
    super(props);
    // This binding is necessary to make `this` work in the callback
    this.handleClick0 = this.handleClick0.bind(this);
    this.handleClick33 = this.handleClick33.bind(this);
    this.handleClick66 = this.handleClick66.bind(this);
    this.handleClick100 = this.handleClick100.bind(this);
  }

  get rootURLsafe() {
    return this.props.point.rootURLsafe
  }

  get parentRootURLsafe() {
    return this.props.parentPoint.rootURLsafe
  }

  get linkType(){
    switch (this.props.linkType) {
      case EvidenceType.SUPPORT:
        return "supporting"
      case EvidenceType.COUNTER:
        return "counter"
      default:
        return null
    }
  }

  handleClick0() {
    console.log("0");
    if (this.props.data.currentUser){
      this.props.mutate({
        variables: {linkType: this.linkType, url: this.props.point.url, parentRootURLsafe: this.parentRootURLsafe, rootURLsafe: this.rootURLsafe, vote: 0}
      }).then( res => {
        console.log(res)
      });
    } else {
      $("#loginDialog").modal("show");
    }
  }

  handleClick33() {
    console.log("33");
    if (this.props.data.currentUser){
      this.props.mutate({
        variables: {linkType: this.linkType, url: this.props.point.url, parentRootURLsafe: this.parentRootURLsafe, rootURLsafe: this.rootURLsafe, vote: 33}
      }).then( res => {
        console.log(res)
      });
    } else {
      $("#loginDialog").modal("show");
    }
  }

  handleClick66() {
    console.log("66");
    if (this.props.data.currentUser){
      this.props.mutate({
        variables: {linkType: this.linkType, url: this.props.point.url, parentRootURLsafe: this.parentRootURLsafe, rootURLsafe: this.rootURLsafe, vote: 66}
      }).then( res => {
        console.log(res)
      });
    } else {
      $("#loginDialog").modal("show");
    }
  }

  handleClick100() {
    console.log("100");
    if (this.props.data.currentUser){

      this.props.mutate({
        variables: {linkType: this.linkType, url: this.props.point.url, parentRootURLsafe: this.parentRootURLsafe, rootURLsafe: this.rootURLsafe, vote: 100}
      }).then( res => {
      }).then( res => {
        console.log(res)
      });
    } else {
      $("#loginDialog").modal("show");
    }
  }
  
  // TODO: reflect the user's current vote;
  //   if it is 100% or 66%, add the class add class .myRelevanceVoteHigh
  //   if it is 33% or 0%, add the class add class .myRelevanceVoteLow
  render(){
    return <div className="relCtrlGroup" >
    <div className="relCtrlLabel">How Relevant is this claim?</div>
      <div className="relCtrlVoteOptions">
      <a className="relVoteLink scaleDownOnClick" onClick={this.handleClick100}>100<span className="perctSignSmall">%</span></a>
      <a className="relVoteLink scaleDownOnClick" onClick={this.handleClick66}>66<span className="perctSignSmall">%</span></a>
      <a className="relVoteLink scaleDownOnClick" onClick={this.handleClick33}><span className="numbersFixVertAlign">33</span><span className="perctSignSmall">%</span></a>
      <a className="relVoteLink scaleDownOnClick" onClick={this.handleClick0}>0<span className="perctSignSmall">%</span></a>
    </div>
      </div>
    }
}

const RelevanceVote = compose(
  graphql(RelevanceVoteQuery),
  graphql(CurrentUserQuery),
)(RelevanceComponent)


class PointCard extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
    expandedIndex: {},
    relLinkClicked: false
  }
    this.handleSeeEvidence = this.handleSeeEvidence.bind(this);
    this.handleHideEvidence = this.handleHideEvidence.bind(this);
    this.handleToggleEvidence = this.handleToggleEvidence.bind(this);
    this.renderSubPointCard = this.renderSubPointCard.bind(this);
    this.handleRelClick = this.handleRelClick.bind(this);
  }

   //Assign focus - WIP

  // TO DO: make focus on the 1st point loaded (not the last one, as its currently doing) --> may need to happen in Evidence?
  scroll() {
    // this.cardToScrollTo.scrollIntoView({behavior: "smooth", block: "end", inline: "nearest"});
  }

  componentDidMount() {
    console.log("pointCard: componentDidMount()");
    //this.cardToFocusOn.focus();

    // scroll browser to unfolded claim
    // TO DO: currently scrolling to get bottom unfolded claim into view, but maybe we should be scrolling to get the
    //        unfolded claim into view and as many of its children as possible; wait till focus() is sorted before pursuing
    // TO DO: Note that our two refs inputs are writing over eachother; we need to build a container to hold them and edit that as per https://github.com/react-native-training/react-native-elements/issues/392
    // TO DO: "smooth" option not currently supported by Safari or iOS Safari
    //this.cardToScrollTo.scrollIntoView({behavior: "smooth", block: "start", inline: "nearest"});
    //setTimeout( this.scroll() , 3600);
  }
/*
  // uses tabbable.js plugin
  focusOnNextCard() {
    setTimeout(function () { $.tabNext() } , 1200);
    console.log("pointCard : focusOnNextCard() ")
  }
*/

  get point() {
    return this.props.data.point ? this.props.data.point : this.props.point
  }

  get evidenceType() {
    if (this.props.link){
      switch (this.props.link.type) {
        case "supporting":
          return EvidenceType.SUPPORT
        case "counter":
          return EvidenceType.COUNTER
        default:
          return null
      }
    }
  }

  // TODO: the "root" case doesn't seem to be working -JF
  evidenceTypeClass() {
    switch (this.evidenceType){
      case EvidenceType.ROOT:
        return "root";
      case EvidenceType.SUPPORT:
        return "support";
      case EvidenceType.COUNTER:
        return "counter";
      default:
        return "";
    }
  }

  get relevance() {
    return this.props.link && this.props.link.relevance
  }

  handleRelClick(e) {
    //console.log("toggle relevance ui");
    if (this.state.relLinkClicked) {
      this.setState({ relLinkClicked: false })
    } else {
      this.setState({ relLinkClicked: true })
    }
  }

  relevanceCtrlUI() {
    if (this.props.parentPoint) {
      return <span>
        { this.state.relLinkClicked ?
            <div className="relevanceCtrlArea">
              <RelevanceVote point={this.point} parentPoint={this.props.parentPoint} linkType={this.evidenceType}/>
            </div> :
            <span className="noRelevanceCtrl"></span>
        }
      </span>
    } else {
      return null
    }
  }

  // TODO: rebuild arrow using css in order to control stroke width, instead of unicode &#x21B3;
  relevanceLinkUI() {
    if (this.props.parentPoint) {
    let classesRelevanceLink = `relevanceLink ${this.evidenceTypeClass()}`
    return <a className={classesRelevanceLink} onClick={this.handleRelClick}>
      <div className="relevanceLinkArea">
        <div className="dottedLine dottedLineRelevanceLink"></div>
        <span className="relevanceDisplay">{this.relevance}%</span>
        <div className="arrowCard">&#x21B3;</div>
        { this.state.buttonClicked ?
            <RelevanceVote point={this.point} parentPoint={this.props.parentPoint} linkType={this.evidenceType}/> :
            <span></span>
        }
      </div></a>
    } else {
      return null
    }
  }

  handleSeeEvidence(point=this.point) {
    const i = this.state.expandedIndex
    i[point.id] = true
    this.setState({expandedIndex: i})
    this.props.handleSeeEvidence && this.props.handleSeeEvidence(point);
  }

  handleHideEvidence(point=this.point) {
    const i = this.state.expandedIndex
    i[point.id] = false
    this.setState({expandedIndex: i})
    this.props.handleHideEvidence && this.props.handleHideEvidence(point);
  }

  handleToggleEvidence(point=this.point) {
    console.log("pointCard : toggle ")
    const i = this.state.expandedIndex
    if (this.expanded() ) {
      console.log("pointCard : EXPANDED ")
      i[point.id] = false
      this.setState({expandedIndex: i})
    } else {
      console.log("pointCard : NOT EXPANDED ")
      i[point.id] = true
      this.setState({expandedIndex: i})
    }
  }

  expanded() {
    return this.state.expandedIndex[this.point.id]
  }

  renderSubPointCard(parentPoint, pointEdge, index){
    return newPointCard(pointEdge,
                        {index: index,
                         parentPoint: parentPoint,
                         expandedIndex: this.state.expandedIndex,
                         handleSeeEvidence: this.handleSeeEvidence,
                         handleHideEvidence:this.handleHideEvidence});
  }

  contentWidth() {
  // TODO old django pointBox.html also checks if point.imageURL.strip exists - is that necessary here? -JF
    if (this.point.imageURL) {
      return "span9"
    } else {
      return "span12 fullWidthContent"
    }
  }

  image() {
  // TODO old django pointBox.html also checks if point.imageURL.strip exists - is that necessary here? -JF
  if (this.point.imageURL)
    return  <div className="span3 pointCardImageContainer"><img className="pointCardImage" src={this.point.fullPointImage} alt="an image"></img></div>
  }

  evidence() {
    if (this.expanded() ) {
      // If this is the first level down, remove an indent bc the Relevance widget effectively creates one when it appears for the first time
      let classesEvidenceBlock = `evidenceBlock ${!this.props.parentPoint ? "removeOneIndent" : null}`
      let classesEvidenceArrow = `evidenceBlock ${!this.props.parentPoint ? "removeOneIndent" : null}`
      console.log("pointCard : evidence() ")
      return <div className={classesEvidenceBlock}>
      <div className="arrowPointToSupport">{this.numSupportingPlusCounter() > 0 ? "↓" : null}</div>
        {this.supportingPoints()}
          {this.counterPoints()}
      </div>
    }
  }

  supportingPoints(){
    if (this.expanded() && this.point.supportingPoints) {
      return <div className="evidenceBlockSupport">
        <div className="evidenceList">
          {this.point.supportingPoints.edges.length > 0 && <div className="supportHeading">Supporting Claims</div>}
          {this.point.supportingPoints.edges.map((edge, i) => this.renderSubPointCard(this.point, edge, i))}
      <AddEvidence point={this.point} type={EvidenceType.SUPPORT}/>
    </div>
      </div>
    }
  }

  counterPoints(){
    if (this.expanded() && this.point.counterPoints){
      return <div className="evidenceBlockCounter">
        <div className="evidenceList">
        {this.point.counterPoints.edges.length > 0 && <div className="counterHeading">Counter Claims</div>}
          {this.point.counterPoints.edges.map((edge, i) => this.renderSubPointCard(this.point, edge, i))}
          <AddEvidence point={this.point} type={EvidenceType.COUNTER}/>
    </div>
      </div>
    }
  }

  // TODO: this is declared as a local function in two different componants - should it be a global fuction or a const? -JF
  numSupportingPlusCounter(){
    return ( this.point.numSupporting + this.point.numCounter)
  }

  // TODO: this is defined in the model point.py, so we could pass it up through GraphQL if that would be faster
  linksRatio() {
    let sup = this.point.numSupporting
    let cou = this.point.numCounter
    if (sup == 0 && cou == 0)
      return 50
    else if (cou == 0)
      return 100
    else if (sup == 0)
      return 0
    else {
      let ratio = sup/(sup + cou)
      //console.log("linksRatio : " + ratio)
      return ratio
    }
  }

  sources(){
    if (this.point.sources){
      return <div className="row-fluid">
        <div className="pointText span12">
          <Sources point={this.point}/>
        </div>
      </div>
    }
  }

  // TODO: make Edit Claim work
  moreMenu() {
    return <span className="cardTopRowItem dropdown">
      <a className="moreMenu dropdown-toggle"  data-toggle="dropdown">&#9776;</a>
      <ul id="" className="dropdown-menu" role="menu" aria-labelledby="dropdownMenu">
         <li>More Actions</li>
         <li className="divider"></li>
         <li><span className=""><span className="iconWithStat fa fa-level-up"></span>{this.point.supportedCount} upstream points</span></li>
         <li className="divider"></li>
         <li><a onClick={this.point.handleClickEdit} className="" >Edit Claim</a></li>
         <li className="divider"></li>
         <li><a target="_blank" href={this.point.url}>Open in a new tab</a></li>
       </ul>
    </span>
  }
/*
        Code to check if current user is the point Author
          {this.props.data.currentUser &&
          this.props.data.currentUser.url == this.point.authorURL &&
          <a onClick={this.handleClickEdit} className="editLink" >Edit</a>}
*/



  // TODO: I moved the Edit button inside the more Menu and now it's  no longer working. I tried building the MoreMenu as a local and as a global fuction ( this.moreMenu() } v <MoreMenu point={point}/> ) ). Lets pick which to use and trash the other code -JF
  // TODO: ref being used on the pointCard to grab it for focus assignment, though that's not fully implemented yet
 render(){
    const point = this.point;
    console.log("rendering " + point.url)
    let classesListedClaim = `listedClaim ${this.state.relLinkClicked ? "relGroupHilite" : "relNotClicked"} ${this.evidenceTypeClass()=="support" ? "linkedClaim" : "rootClaim"}`;
    let classesStackCardGroup = `stackCardGroup ${this.state.relLinkClicked ? "relExtraMarginBottom" : "relNotClicked"}`
    let classesStackCard1 = `stackCard ${this.numSupportingPlusCounter() < 3 ? "stackCardHidden" : ""} ${this.linksRatio() <= 0.75 ? "counter" : ""} ${this.expanded() ? "stackCardDealBottom stackCardDealFade" : ""}`
    let classesStackCard2 = `stackCard ${this.numSupportingPlusCounter() < 2 ? "stackCardHidden" : ""} ${this.linksRatio() <= 0.50 ? "counter" : ""} ${this.expanded() ? "stackCardDealInvertXform stackCardDealFade" : ""}`
    let classesStackCard3 = `stackCard ${this.numSupportingPlusCounter() < 1 ? "stackCardHidden" : ""} ${this.linksRatio() <= 0.25 ? "counter" : ""} ${this.expanded() ? "stackCardDealInvertXform stackCardDealFade" : ""}`
    let classesPointCard = `point-card stackCard ${this.expanded() ? "stackCardDealInvertXform" : ""} ${this.evidenceTypeClass()} row-fluid toggleChildVisOnHover`;
    //console.log("linksRatio " + this.linksRatio() )
    return <div className="listedClaimAndItsEvidence" ref={(input) => { this.cardToScrollTo = input; }}>

    <div className={classesListedClaim}>
      { this.relevanceCtrlUI() }
      { this.relevanceLinkUI() }

    <div className={classesStackCardGroup} tabIndex="0" ref={(input) => { this.cardToFocusOn = input;}} >
    <div className={classesStackCard1} tabIndex="-1">
    <div className={classesStackCard2} tabIndex="-1">
    <div className={classesStackCard3} tabIndex="-1">
      <div className={classesPointCard} tabIndex="-1">
      <div className={ this.contentWidth()  }>
        <div className="row-fluid">
        <div className="cardTopRow span12">
          <Byline point={point}/>
          <CommentCount point={point}/>
          <ShareIcon point={point}/>
          { this.moreMenu() }
        </div>
        </div>
        <div className="row-fluid">
        <div className="pointText span12">
          <Point point={point} onClick={this.handleToggleEvidence}/>
        </div>
        </div>
        {this.sources()}
        <div className="row-fluid">
        <div className="cardBottomActionRow" >
          <span><EvidenceLink point={point} onSee={this.handleSeeEvidence} onHide={this.handleHideEvidence} onToggle={this.handleToggleEvidence} expanded={this.expanded()}/></span>
          <span><AgreeDisagree point={point} parentPoint={this.props.parentPoint}/></span>
        </div>
        </div>
      </div>
      {this.image()}
      </div>
    </div>
    </div>
    </div>
    </div>

    </div>

      <div className="evidenceRow row-fluid">
      {this.evidence()}
      </div>

    </div>;
  }
}

export function newPointCard(pointEdge, {index, expandedIndex, handleSeeEvidence, handleHideEvidence, parentPoint}) {
  let point = pointEdge.node;
  let classes = `listedClaimGroup`;
  if (point) {
  return <div className={classes} key={point.url}>
      <ExpandedPointCard point={point}
    url={point.url}
    expandedIndex={expandedIndex}
    expanded={true}
    link={pointEdge.link}
    handleSeeEvidence={handleSeeEvidence}
    handleHideEvidence={handleHideEvidence}
    parentPoint={parentPoint}/>
      </div>;
  } else {
    return <div className="listedClaimGroup" key={index}></div>;
  }
}


export const GetPoint = gql`
${expandedPointFieldsFragment}
query Point($url: String) {
  point(url: $url) {
    ...pointFields,
    ...evidenceFields
 }
}`

export {PointCard};
export const ExpandedPointCard = graphql(GetPoint)(PointCard)

// TODO: explore a mutation-based point loading model
// export const ExpandPoint = gql`
// ${expandedPointFieldsFragment}
// mutation ExpandPoint($url: String!) {
//   expandPoint(url: $url) {
//     point {
//       id,
//       ...evidenceFields
//     }
//   }
// }`
// export const CollapsedPointCard = graphql(ExpandPoint)(PointCard)